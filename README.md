# deezy-auto-swap
automatically swap lightning btc for on-chain btc with deezy. run this continuously to opportunistically find low-fee paths to swap out with, ensuring you always acquire the least expensive inbound liquidity while making your channels more balanced.

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

`API_TOKEN` is your Deezy API key and can be obtained by emailing support@deezy.io (or set to `00000000000000000000000000000000` if on testnet)

`SWAP_AMOUNT_SATS` is the size of the swaps you want to perform. smaller amounts should have cheaper routing fees but are less efficient per on-chain transaction.

`MAX_FEE_PPM` is the max total net ppm you're willing to pay to swap. This includes both the deezy server fee and the potential routing fees required to make the payment.

`LOCAL_CHANNEL_BALANCE_TARGET_RATIO` helps select which channels to swap out of. For example setting to 0.6 would mean that only channels will be used where your local balance is 60% or more of the channel capacity.

`LN_ONCHAIN_TARGET_RATIO` will swap until the ratio of lightning funds to all funds is below this ratio. For example if you have 1 BTC in lightning and 1 BTC on-chain, then your current ratio is 0.5. If the config option is set to 0.4 then this would try to do swaps until your lightning ratio falls below 0.4. If your current ratio is below your target ratio, no action will be taken. Unconfirmed utxos are counted as part of the chain balance.

`OUT_NODES` List of node pubkeys. Only send out of channels with these nodes. Can be used along with `LOCAL_CHANNEL_BALANCE_TARGET_RATIO` 

`AVOID_NODES` List of node pubkeys. Don't send out of channels with these nodes.

`PERIOD_SECONDS` How often to attempt a swap.

`PATHFINDING_TIMEOUT_SECONDS` How long to look for a path before giving up and retrying.

`SWAP_CHAIN_TARGET_CONFIRMATIONS` Target block confirmation of swap on-chain tx. Lower value means faster and more expensive. 

`SWAP_CHAIN_SATS_PER_VBYTE` Use a fixed fee rate for the swap's on-chain. Be careful if mempool conditions change rapidly your swap tx could get dropped from mempool (but you can always rebroadcast yourself). 
