# deezy-auto-swap
automatically swap lightning btc for on-chain btc with deezy

## setup
```
git clone git@github.com:dannydeezy/deezy-auto-swap.git
cd deezy-auto-swap
cp sample-config.json config.json
# edit config.json with your custom values
npm i
```

## run
```
node index.js
```

## config
`ENVIRONMENT` should be `"TESTNET"` or `"MAINNET"`

`SWAP_AMOUNT_SATS` is the size of the swaps you want to perform. smaller amounts should have cheaper routing fees but are less efficient per on-chain transaction.

`MAX_FEE_PPM` is the max total net ppm you're willing to pay to swap. This includes both the deezy server fee and the potential routing fees required to make the payment.

`LOCAL_CHANNEL_BALANCE_TARGET_RATIO` helps select which channels to swap out of. For example setting to 0.6 would mean that only channels will be used where your local balance is 60% or more of the channel capacity.

`OUT_NODES` List of node pubkeys. Only send out of channels with these nodes. Can be used along with `LOCAL_CHANNEL_BALANCE_TARGET_RATIO` 

`AVOID_NODES` List of node pubkeys. Don't send out of channels with these nodes.

`PERIOD_SECONDS` How often to attempt a swap.

`PATHFINDING_TIMEOUT_SECONDS` How long to look for a path before giving up and retrying.

`SWAP_CHAIN_TARGET_CONFIRMATIONS` Target block confirmation of swap on-chain tx. Lower value means faster and more expensive. 

`SWAP_CHAIN_SATS_PER_VBYTE` Use a fixed fee rate for the swap's on-chain. Be careful if mempool conditions change rapidly your swap tx could get dropped from mempool (but you can always rebroadcast yourself). 