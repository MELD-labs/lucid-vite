{
  description = "lucid";

  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-23.11-darwin";
  };

  outputs = { self, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let pkgs = import nixpkgs {
        inherit system;
      };
      in {
        devShell = with pkgs; mkShell {
          buildInputs = [
            git
            nodejs
            deno
          ];
       };
      }
    );
}
