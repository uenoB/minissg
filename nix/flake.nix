{
  inputs.nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
  outputs =
    { self, nixpkgs }:
    with nixpkgs;
    {
      devShells = lib.genAttrs lib.systems.flakeExposed (system: {
        default = nixpkgs.legacyPackages.${system}.mkShellNoCC {
          packages = with nixpkgs.legacyPackages.${system}; [
            nodejs
            pnpm
          ];
        };
      });
    };
}
