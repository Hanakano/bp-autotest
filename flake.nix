{
  description = "Development environment with Node.js and Bun";
  
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  };
  
  outputs = { self, nixpkgs }:
    let
      supportedSystems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;
      pkgsFor = system: nixpkgs.legacyPackages.${system};
    in {
      devShells = forAllSystems (system: {
        default = (pkgsFor system).mkShell {
          packages = with (pkgsFor system); [
            bun
            nodejs
            direnv
          ];
          
          # Use nix-shell-based environment variable setting
          NODE_ENV = "development";
          WEBHOOK_ID="42536745-17d0-4cd6-a6e2-450d8c18c2a9";
          shellHook = ''
            bun install
            '';
        };
      });
    };
}
