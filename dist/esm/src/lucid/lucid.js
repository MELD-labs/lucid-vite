import { C } from "../core/mod.js";
import { coreToUtxo, createCostModels, fromHex, fromUnit, paymentCredentialOf, toHex, toUnit, Utils, utxoToCore, } from "../utils/mod.js";
import { Tx } from "./tx.js";
import { TxComplete } from "./tx_complete.js";
import { discoverOwnUsedTxKeyHashes, walletFromSeed } from "../misc/wallet.js";
import { signData, verifyData } from "../misc/sign_data.js";
import { Message } from "./message.js";
import { SLOT_CONFIG_NETWORK } from "../plutus/time.js";
import { Data } from "../plutus/data.js";
import { Emulator } from "../provider/emulator.js";
export class Lucid {
    constructor() {
        Object.defineProperty(this, "txBuilderConfig", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "wallet", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "provider", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "network", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: "Mainnet"
        });
        Object.defineProperty(this, "utils", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
    }
    static async new(provider, network) {
        const lucid = new this();
        if (network)
            lucid.network = network;
        if (provider) {
            lucid.provider = provider;
            const protocolParameters = await provider.getProtocolParameters();
            if (lucid.provider instanceof Emulator) {
                lucid.network = "Custom";
                SLOT_CONFIG_NETWORK[lucid.network] = {
                    zeroTime: lucid.provider.now(),
                    zeroSlot: 0,
                    slotLength: 1000,
                };
            }
            const slotConfig = SLOT_CONFIG_NETWORK[lucid.network];
            lucid.txBuilderConfig = C.TransactionBuilderConfigBuilder.new()
                .coins_per_utxo_byte(C.BigNum.from_str(protocolParameters.coinsPerUtxoByte.toString()))
                .fee_algo(C.LinearFee.new(C.BigNum.from_str(protocolParameters.minFeeA.toString()), C.BigNum.from_str(protocolParameters.minFeeB.toString())))
                .key_deposit(C.BigNum.from_str(protocolParameters.keyDeposit.toString()))
                .pool_deposit(C.BigNum.from_str(protocolParameters.poolDeposit.toString()))
                .max_tx_size(protocolParameters.maxTxSize)
                .max_value_size(protocolParameters.maxValSize)
                .collateral_percentage(protocolParameters.collateralPercentage)
                .max_collateral_inputs(protocolParameters.maxCollateralInputs)
                .max_tx_ex_units(C.ExUnits.new(C.BigNum.from_str(protocolParameters.maxTxExMem.toString()), C.BigNum.from_str(protocolParameters.maxTxExSteps.toString())))
                .ex_unit_prices(C.ExUnitPrices.from_float(protocolParameters.priceMem, protocolParameters.priceStep))
                .slot_config(C.BigNum.from_str(slotConfig.zeroTime.toString()), C.BigNum.from_str(slotConfig.zeroSlot.toString()), slotConfig.slotLength)
                .blockfrost(
            // We have Aiken now as native plutus core engine (primary), but we still support blockfrost (secondary) in case of bugs.
            C.Blockfrost.new(
            // deno-lint-ignore no-explicit-any
            (provider?.url || "") + "/utils/txs/evaluate", 
            // deno-lint-ignore no-explicit-any
            provider?.projectId || ""))
                .costmdls(createCostModels(protocolParameters.costModels))
                .build();
        }
        lucid.utils = new Utils(lucid);
        return lucid;
    }
    /**
     * Switch provider and/or network.
     * If provider or network unset, no overwriting happens. Provider or network from current instance are taken then.
     */
    async switchProvider(provider, network) {
        if (this.network === "Custom") {
            throw new Error("Cannot switch when on custom network.");
        }
        const lucid = await Lucid.new(provider, network);
        this.txBuilderConfig = lucid.txBuilderConfig;
        this.provider = provider || this.provider;
        this.network = network || this.network;
        this.wallet = lucid.wallet;
        return this;
    }
    newTx() {
        return new Tx(this);
    }
    fromTx(tx) {
        return new TxComplete(this, C.Transaction.from_bytes(fromHex(tx)));
    }
    /** Signs a message. Expects the payload to be Hex encoded. */
    newMessage(address, payload) {
        return new Message(this, address, payload);
    }
    /** Verify a message. Expects the payload to be Hex encoded. */
    verifyMessage(address, payload, signedMessage) {
        const { paymentCredential, stakeCredential, address: { hex: addressHex } } = this.utils.getAddressDetails(address);
        const keyHash = paymentCredential?.hash || stakeCredential?.hash;
        if (!keyHash)
            throw new Error("Not a valid address provided.");
        return verifyData(addressHex, keyHash, payload, signedMessage);
    }
    currentSlot() {
        return this.utils.unixTimeToSlot(Date.now());
    }
    utxosAt(addressOrCredential) {
        return this.provider.getUtxos(addressOrCredential);
    }
    utxosAtWithUnit(addressOrCredential, unit) {
        return this.provider.getUtxosWithUnit(addressOrCredential, unit);
    }
    /** Unit needs to be an NFT (or optionally the entire supply in one UTxO). */
    utxoByUnit(unit) {
        return this.provider.getUtxoByUnit(unit);
    }
    utxosByOutRef(outRefs) {
        return this.provider.getUtxosByOutRef(outRefs);
    }
    delegationAt(rewardAddress) {
        return this.provider.getDelegation(rewardAddress);
    }
    awaitTx(txHash, checkInterval = 3000) {
        return this.provider.awaitTx(txHash, checkInterval);
    }
    async datumOf(utxo, type) {
        if (!utxo.datum) {
            if (!utxo.datumHash) {
                throw new Error("This UTxO does not have a datum hash.");
            }
            utxo.datum = await this.provider.getDatum(utxo.datumHash);
        }
        return Data.from(utxo.datum, type);
    }
    /** Query CIP-0068 metadata for a specifc asset. */
    async metadataOf(unit) {
        const { policyId, name, label } = fromUnit(unit);
        switch (label) {
            case 222:
            case 333:
            case 444: {
                const utxo = await this.utxoByUnit(toUnit(policyId, name, 100));
                const metadata = await this.datumOf(utxo);
                return Data.toJson(metadata.fields[0]);
            }
            default:
                throw new Error("No variant matched.");
        }
    }
    /**
     * Cardano Private key in bech32; not the BIP32 private key or any key that is not fully derived.
     * Only an Enteprise address (without stake credential) is derived.
     */
    selectWalletFromPrivateKey(privateKey) {
        const priv = C.PrivateKey.from_bech32(privateKey);
        const pubKeyHash = priv.to_public().hash();
        this.wallet = {
            // deno-lint-ignore require-await
            address: async () => C.EnterpriseAddress.new(this.network === "Mainnet" ? 1 : 0, C.StakeCredential.from_keyhash(pubKeyHash))
                .to_address()
                .to_bech32(undefined),
            // deno-lint-ignore require-await
            rewardAddress: async () => null,
            getUtxos: async () => {
                return await this.utxosAt(paymentCredentialOf(await this.wallet.address()));
            },
            getUtxosCore: async () => {
                const utxos = await this.utxosAt(paymentCredentialOf(await this.wallet.address()));
                const coreUtxos = C.TransactionUnspentOutputs.new();
                utxos.forEach((utxo) => {
                    coreUtxos.add(utxoToCore(utxo));
                });
                return coreUtxos;
            },
            // deno-lint-ignore require-await
            getDelegation: async () => {
                return { poolId: null, rewards: 0n };
            },
            // deno-lint-ignore require-await
            signTx: async (tx) => {
                const witness = C.make_vkey_witness(C.hash_transaction(tx.body()), priv);
                const txWitnessSetBuilder = C.TransactionWitnessSetBuilder.new();
                txWitnessSetBuilder.add_vkey(witness);
                return txWitnessSetBuilder.build();
            },
            // deno-lint-ignore require-await
            signMessage: async (address, payload) => {
                const { paymentCredential, address: { hex: hexAddress } } = this.utils
                    .getAddressDetails(address);
                const keyHash = paymentCredential?.hash;
                const originalKeyHash = pubKeyHash.to_hex();
                if (!keyHash || keyHash !== originalKeyHash) {
                    throw new Error(`Cannot sign message for address: ${address}.`);
                }
                return signData(hexAddress, payload, privateKey);
            },
            submitTx: async (tx) => {
                return await this.provider.submitTx(tx);
            },
        };
        return this;
    }
    selectWallet(api) {
        const getAddressHex = async () => {
            const [addressHex] = await api.getUsedAddresses();
            if (addressHex)
                return addressHex;
            const [unusedAddressHex] = await api.getUnusedAddresses();
            return unusedAddressHex;
        };
        this.wallet = {
            address: async () => C.Address.from_bytes(fromHex(await getAddressHex())).to_bech32(undefined),
            rewardAddress: async () => {
                const [rewardAddressHex] = await api.getRewardAddresses();
                const rewardAddress = rewardAddressHex
                    ? C.RewardAddress.from_address(C.Address.from_bytes(fromHex(rewardAddressHex)))
                        .to_address()
                        .to_bech32(undefined)
                    : null;
                return rewardAddress;
            },
            getUtxos: async () => {
                const utxos = ((await api.getUtxos()) || []).map((utxo) => {
                    const parsedUtxo = C.TransactionUnspentOutput.from_bytes(fromHex(utxo));
                    return coreToUtxo(parsedUtxo);
                });
                return utxos;
            },
            getUtxosCore: async () => {
                const utxos = C.TransactionUnspentOutputs.new();
                ((await api.getUtxos()) || []).forEach((utxo) => {
                    utxos.add(C.TransactionUnspentOutput.from_bytes(fromHex(utxo)));
                });
                return utxos;
            },
            getDelegation: async () => {
                const rewardAddr = await this.wallet.rewardAddress();
                return rewardAddr
                    ? await this.delegationAt(rewardAddr)
                    : { poolId: null, rewards: 0n };
            },
            signTx: async (tx) => {
                const witnessSet = await api.signTx(toHex(tx.to_bytes()), true);
                return C.TransactionWitnessSet.from_bytes(fromHex(witnessSet));
            },
            signMessage: async (address, payload) => {
                const hexAddress = toHex(C.Address.from_bech32(address).to_bytes());
                return await api.signData(hexAddress, payload);
            },
            submitTx: async (tx) => {
                const txHash = await api.submitTx(tx);
                return txHash;
            },
        };
        return this;
    }
    /**
     * Emulates a wallet by constructing it with the utxos and an address.
     * If utxos are not set, utxos are fetched from the provided address.
     */
    selectWalletFrom({ address, utxos, rewardAddress, }) {
        const addressDetails = this.utils.getAddressDetails(address);
        this.wallet = {
            // deno-lint-ignore require-await
            address: async () => address,
            // deno-lint-ignore require-await
            rewardAddress: async () => {
                const rewardAddr = !rewardAddress && addressDetails.stakeCredential
                    ? (() => {
                        if (addressDetails.stakeCredential.type === "Key") {
                            return C.RewardAddress.new(this.network === "Mainnet" ? 1 : 0, C.StakeCredential.from_keyhash(C.Ed25519KeyHash.from_hex(addressDetails.stakeCredential.hash)))
                                .to_address()
                                .to_bech32(undefined);
                        }
                        return C.RewardAddress.new(this.network === "Mainnet" ? 1 : 0, C.StakeCredential.from_scripthash(C.ScriptHash.from_hex(addressDetails.stakeCredential.hash)))
                            .to_address()
                            .to_bech32(undefined);
                    })()
                    : rewardAddress;
                return rewardAddr || null;
            },
            getUtxos: async () => {
                return utxos ? utxos : await this.utxosAt(paymentCredentialOf(address));
            },
            getUtxosCore: async () => {
                const coreUtxos = C.TransactionUnspentOutputs.new();
                (utxos ? utxos : await this.utxosAt(paymentCredentialOf(address)))
                    .forEach((utxo) => coreUtxos.add(utxoToCore(utxo)));
                return coreUtxos;
            },
            getDelegation: async () => {
                const rewardAddr = await this.wallet.rewardAddress();
                return rewardAddr
                    ? await this.delegationAt(rewardAddr)
                    : { poolId: null, rewards: 0n };
            },
            // deno-lint-ignore require-await
            signTx: async () => {
                throw new Error("Not implemented");
            },
            // deno-lint-ignore require-await
            signMessage: async () => {
                throw new Error("Not implemented");
            },
            submitTx: async (tx) => {
                return await this.provider.submitTx(tx);
            },
        };
        return this;
    }
    /**
     * Select wallet from a seed phrase (e.g. 15 or 24 words). You have the option to choose between a Base address (with stake credential)
     * and Enterprise address (without stake credential). You can also decide which account index to derive. By default account 0 is derived.
     */
    selectWalletFromSeed(seed, options) {
        const { address, rewardAddress, paymentKey, stakeKey } = walletFromSeed(seed, {
            addressType: options?.addressType || "Base",
            accountIndex: options?.accountIndex || 0,
            password: options?.password,
            network: this.network,
        });
        const paymentKeyHash = C.PrivateKey.from_bech32(paymentKey).to_public()
            .hash().to_hex();
        const stakeKeyHash = stakeKey
            ? C.PrivateKey.from_bech32(stakeKey).to_public().hash().to_hex()
            : "";
        const privKeyHashMap = {
            [paymentKeyHash]: paymentKey,
            [stakeKeyHash]: stakeKey,
        };
        this.wallet = {
            // deno-lint-ignore require-await
            address: async () => address,
            // deno-lint-ignore require-await
            rewardAddress: async () => rewardAddress || null,
            // deno-lint-ignore require-await
            getUtxos: async () => this.utxosAt(paymentCredentialOf(address)),
            getUtxosCore: async () => {
                const coreUtxos = C.TransactionUnspentOutputs.new();
                (await this.utxosAt(paymentCredentialOf(address))).forEach((utxo) => coreUtxos.add(utxoToCore(utxo)));
                return coreUtxos;
            },
            getDelegation: async () => {
                const rewardAddr = await this.wallet.rewardAddress();
                return rewardAddr
                    ? await this.delegationAt(rewardAddr)
                    : { poolId: null, rewards: 0n };
            },
            signTx: async (tx) => {
                const utxos = await this.utxosAt(paymentCredentialOf(address));
                const ownKeyHashes = [paymentKeyHash, stakeKeyHash];
                const usedKeyHashes = discoverOwnUsedTxKeyHashes(tx, ownKeyHashes, utxos);
                const txWitnessSetBuilder = C.TransactionWitnessSetBuilder.new();
                usedKeyHashes.forEach((keyHash) => {
                    const witness = C.make_vkey_witness(C.hash_transaction(tx.body()), C.PrivateKey.from_bech32(privKeyHashMap[keyHash]));
                    txWitnessSetBuilder.add_vkey(witness);
                });
                return txWitnessSetBuilder.build();
            },
            // deno-lint-ignore require-await
            signMessage: async (address, payload) => {
                const { paymentCredential, stakeCredential, address: { hex: hexAddress }, } = this.utils
                    .getAddressDetails(address);
                const keyHash = paymentCredential?.hash || stakeCredential?.hash;
                const privateKey = privKeyHashMap[keyHash];
                if (!privateKey) {
                    throw new Error(`Cannot sign message for address: ${address}.`);
                }
                return signData(hexAddress, payload, privateKey);
            },
            submitTx: async (tx) => {
                return await this.provider.submitTx(tx);
            },
        };
        return this;
    }
}
