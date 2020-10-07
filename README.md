`MasterPerfumer` distributes Cologne Tokens (CLGN) in three distinct distribution phases, to users who have "staked" any of the supported ERC20 tokens (expected to be Uniswap or SushiSwap LP tokens, but really any ERC20 is supported) into MasterPerfumer.

`MasterPerfumer` is based on SushiSwap's `MasterChef` contract. For security reasons, we have tried to minimize changes:

 - Some terminology has been changed
 - The only material update is to the rewards schedule and the configuration thereof, which now supports a finite token supply and a three-phase distribution.

As with `MasterChef`, supported (LP) tokens and rewards can be configured by the `Owner` of `MasterPerfumer` using `add()` and `set()`.

The three reward phases each have a fixed duration and tokens are emitted at a constant rate throughout each phase. The starting block of each phase is configurable by the `Owner` of `MasterPerfumer`, provided the phase in question has not already started and there are at least `minElapsedBlocksBeforePhaseStart` before the updated phase start block.

## Prerequisites

Install [node 12](https://nodejs.org/en/download/) (there is [an issue](https://github.com/trufflesuite/ganache-core/issues/568) with `ganache-core` in node 14) and [yarn](https://yarnpkg.com/getting-started/install).

Run `yarn` from this root directory to install dependencies.

## Compiling

`yarn build`

## Run tests

`yarn test`

## Deploying locally

 - Verify/update all of the constants configured in `scripts/deploy.ts`
 - `yarn deploy-local`

This will deploy to the default network defined in `buidler.config.ts`.

## Deploying to Görli testnet

TODO

## Deploying to Ethereum's mainnet

TODO

## Adding to / updating the list of supported (LP) tokens

Call the the `add()` and `set()` functions in `MasterPerfumer.sol`, from that contract's owner account. The `_allocPoint` argument will probably be the same for all LP tokens to ensure all receive an equal share of the rewards, with the possible exception of some CLGN pools.

## Uploading source code to Etherscan

Configure `ETHERSCAN_API_KEY` in `buidler.config.ts` and run `npx buidler verify`.

## Report gas costs and code coverage

See comments in `buidler.config.ts` if this is required