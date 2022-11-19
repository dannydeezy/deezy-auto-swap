const {
    getChannels,
    pay,
    getNode,
    createChainAddress,
    getChainFeeRate,
    getChannelBalance,
    getUtxos,
    decodePaymentRequest
} = require('ln-service')
const {
    lnd
} = require('./lnd')
const {
    getSwapInfo,
    createSwap
} = require('./deezy')

const axios = require('axios')
const config = require('./config.json')

const PERIOD_SECONDS = config.PERIOD_SECONDS || 60
const PATHFINDING_TIMEOUT_SECONDS= config.PATHFINDING_TIMEOUT_SECONDS || 60 // 1 minute
const OUT_NODES = config.OUT_NODES || []
const AVOID_NODES = config.AVOID_NODES || []
if (OUT_NODES.length > 0 && AVOID_NODES.length > 0) {
    throw new Error('Cannot specify both OUT_NODES and AVOID_NODES')
}
const LOCAL_CHANNEL_BALANCE_TARGET_RATIO = config.LOCAL_CHANNEL_BALANCE_TARGET_RATIO || 0.5
const MAX_FEE_PPM = config.MAX_FEE_PPM || 2500
const SWAP_AMOUNT_SATS = config.SWAP_AMOUNT_SATS || 10000000
if (config.SWAP_CHAIN_SATS_PER_VBYTE && config.SWAP_CHAIN_TARGET_CONFIRMATIONS) {
    throw new Error('Cannot specify both SWAP_CHAIN_SATS_PER_VBYTE and SWAP_CHAIN_TARGET_CONFIRMATIONS')
}
const DEFAULT_SWAP_CHAIN_TARGET_CONFIRMATIONS = 144
const MAX_FAILED_ATTEMPTS_PER_INVOICE = config.MAX_FAILED_ATTEMPTS_PER_INVOICE || 30

// If we fail to pay a swap invoice, we will save it and keep trying until it expires
// so that we don't create a bunch of unnecessary unused invoices :)
let currentInvoice = null
let currentMaxRoutingFeeSats = null
let currentInvoiceAttempts = 0

/**
 * Select which channels to swap out from.
 */
async function selectChannels() {
    const { channels } = await getChannels({ lnd })
    console.log(`Found ${channels.length} total channels`)
    let outgoingChannels
    if (OUT_NODES.length > 0) {
        outgoingChannels = channels.filter(channel => config.OUT_NODES.includes(channel.partner_public_key))
    } else if (AVOID_NODES.length > 0) {
        outgoingChannels = channels.filter(channel => !config.AVOID_NODES.includes(channel.partner_public_key))
    } else {
        outgoingChannels = channels
    }
    outgoingChannels = outgoingChannels.filter(channel => channel.local_balance * 1.0 / (channel.local_balance + channel.remote_balance) > LOCAL_CHANNEL_BALANCE_TARGET_RATIO)
    if (outgoingChannels.length === 0) {
        console.log('No outgoing channels to pick from')
        return
    }
    return outgoingChannels
}

async function getChainBalanceSats() {
    const { utxos } = await getUtxos({ lnd, min_confirmations: 0 }).catch(err => {
        console.log('Error fetching utxos')
        console.error(err)
        return {}
    })
    if (!utxos) return null
    const utxoSumSats = utxos.reduce((acc, utxo) => acc + utxo.tokens, 0)
    return utxoSumSats
}

async function getAndCheckSwapInfo() {
    const deezySwapInfo = await getSwapInfo()
    if (!deezySwapInfo) {
        console.log('Error fetching deezy swap info')
        return null
    }

    if (SWAP_AMOUNT_SATS > deezySwapInfo.max_swap_amount_sats) {
        console.log(`Swap amount ${SWAP_AMOUNT_SATS} is greater than max swap amount ${max_swap_amount_sats}`)
        return null
    }
    if (SWAP_AMOUNT_SATS < deezySwapInfo.min_swap_amount_sats) {
        console.log(`Swap amount ${SWAP_AMOUNT_SATS} is less than min swap amount ${min_swap_amount_sats}`)
        return null
    }
    if (!deezySwapInfo.available) {
        console.log('Deezy swap is not available')
        return null
    }
    return deezySwapInfo
}

async function getOnChainFeeRateSatsPerVbyte() {
    if (config.SWAP_CHAIN_SATS_PER_VBYTE) {
        console.log(`Using pre-set SWAP_CHAIN_SATS_PER_VBYTE of ${config.SWAP_CHAIN_SATS_PER_VBYTE}`)
        return config.SWAP_CHAIN_SATS_PER_VBYTE
    }
    let targetConfirmations
    if (config.SWAP_CHAIN_TARGET_CONFIRMATIONS) {
        targetConfirmations = config.SWAP_CHAIN_TARGET_CONFIRMATIONS
    } else {
        console.log(`SWAP_CHAIN_TARGET_CONFIRMATIONS not set, using default of ${DEFAULT_SWAP_CHAIN_TARGET_CONFIRMATIONS}`)
        targetConfirmations = DEFAULT_SWAP_CHAIN_TARGET_CONFIRMATIONS
    }
    console.log(`Getting fee estimate from LND with target conf of ${targetConfirmations}`)
    const { tokens_per_vbyte } = await getChainFeeRate({ 
        lnd,
        confirmation_target: targetConfirmations
    }).catch(err => {
        console.log('Error getting fee estimate from LND')
        console.error(err)
        return {}
    })
    if (!tokens_per_vbyte) return null
    console.log(`Got fee estimate from LND: ${tokens_per_vbyte} sats/vbyte`)
    return tokens_per_vbyte
}

async function prepareSwap({ deezySwapInfo }) {
    const {
        liquidity_fee_ppm,
        on_chain_bytes_estimate,
    } = deezySwapInfo

    const { address } = await createChainAddress({ lnd })
    console.log(`Will receive on-chain swap to address ${address}`)
    // TODO: you might want to save this address somewhere so you can keep track of it. PR's welcome :)

    const onChainFeeRateSatsPerVbyte = await getOnChainFeeRateSatsPerVbyte()
    if (!onChainFeeRateSatsPerVbyte) return null
    
    const netDeezyFeePpm = (SWAP_AMOUNT_SATS * liquidity_fee_ppm / 1000000) + (onChainFeeRateSatsPerVbyte * on_chain_bytes_estimate)
    if (netDeezyFeePpm > MAX_FEE_PPM) {
        console.log(`Net deezy fee ppm is ${netDeezyFeePpm}, which is greater than MAX_FEE_PPM of ${MAX_FEE_PPM}. Not swapping.`)
        return null
    }
    const maxRoutingFeePpm = MAX_FEE_PPM - netDeezyFeePpm
    const maxRoutingFeeSats = Math.floor(maxRoutingFeePpm * SWAP_AMOUNT_SATS / 1000000)
    console.log(`Will use max routing fee of ${maxRoutingFeeSats} sats`)

    const swapDetails = await createSwap({
        amount_sats: SWAP_AMOUNT_SATS,
        on_chain_address: address,
        on_chain_sats_per_vbyte: onChainFeeRateSatsPerVbyte
    })
    if (!swapDetails) return null
    console.log(swapDetails)
    const {
        bolt11_invoice,
    } = swapDetails
    return {
        bolt11_invoice,
        address,
        maxRoutingFeeSats
    }
}

function abortMission() {
    console.error("Payment timeout exceeded without terminating. Aborting mission!")
    process.exit(1)
}

async function run() {
    console.log(`Running auto swap`)

    if (config.LN_ONCHAIN_TARGET_RATIO) {
        const chainBalanceSats = await getChainBalanceSats()
        if (chainBalanceSats == null) return
        
        console.log(`Chain balance is ${chainBalanceSats / 100000000} btc`)
        const { channel_balance } = await getChannelBalance({ lnd }).catch(err => {
            console.log('Error fetching channel balance')
            console.error(err)
            return {}
        })
        if (channel_balance == undefined) return

        console.log(`Channel balance is ${channel_balance / 100000000} btc`)
        const currentLnOnchainRatio = channel_balance / (channel_balance + chainBalanceSats)
        console.log(`Current LN/chain ratio is ${currentLnOnchainRatio}`)
        if (currentLnOnchainRatio <= config.LN_ONCHAIN_TARGET_RATIO) {
            console.log(`Current LN/chain ratio is below target of ${config.LN_ONCHAIN_TARGET_RATIO}, not swapping`)
            return
        }
        console.log(`Current LN/chain ratio is above target of ${config.LN_ONCHAIN_TARGET_RATIO}, will try to swap`)
    }

    const outgoingChannels = await selectChannels()
    console.log(`Found ${outgoingChannels.length} outgoing channels to pick from`)

    const deezySwapInfo = await getAndCheckSwapInfo()
    if (!deezySwapInfo) return

    console.log(`Got deezy swap info: ${JSON.stringify(deezySwapInfo)}`)
    if (!currentInvoice || !address || currentInvoiceAttempts > MAX_FAILED_ATTEMPTS_PER_INVOICE) {
        console.log(`Getting new address and invoice`)
        const preparedSwapInfo = await prepareSwap({ deezySwapInfo })
        if (!preparedSwapInfo) return

        // TODO: validate the invoice with ln-service's decodePaymentRequest
        currentInvoice = preparedSwapInfo.bolt11_invoice
        address = preparedSwapInfo.address
        currentMaxRoutingFeeSats = preparedSwapInfo.maxRoutingFeeSats
        currentInvoiceAttempts = 0
    }
    console.log(`Attempt ${currentInvoiceAttempts} for address ${address} and invoice ${currentInvoice}`)


    console.log(`Attempting to pay`)
    // Sometimes LND can hang indefinitely on the payment attempt, long past the payment timeout.
    // If it hangs for longer than twice the pathfinding timeout, we kill the process. Note that the payment
    // may succeed or fail. If the payment succeeds then the swap will go through.
    const killProcessTimeout = setTimeout(abortMission, Math.round(PATHFINDING_TIMEOUT_SECONDS * 1000 * 2))
    const paymentResult = await pay(
        {
            lnd,
            request: currentInvoice,
            outgoing_channels: outgoingChannels.length > 0 ? outgoingChannels.map(channel => channel.id) : undefined,
            max_fee: currentMaxRoutingFeeSats,
            pathfinding_timeout: PATHFINDING_TIMEOUT_SECONDS,
        }
    ).catch(err => {
        console.error(err)
        console.log(`Failed to pay invoice ${currentInvoice}`)
        currentInvoiceAttempts++
        return null
    })
    clearTimeout(killProcessTimeout)
    if (!paymentResult || !paymentResult.confirmed_at) return

    const feePpm = Math.round(paymentResult.safe_fee * 1000000 / SWAP_AMOUNT_SATS)
    console.log(`Payment confirmed, with fee ${paymentResult.safe_fee} satoshis, and ppm ${feePpm}`)
    const outPubkey = paymentResult.hops[0].public_key
    const outNode = await getNode({ lnd, public_key: outPubkey })
    console.log(`Out node: ${outNode.alias || outPubkey }\n`)
    currentInvoice = null
    currentInvoiceAttempts = 0
    currentMaxRoutingFeeSats = null
}

const sleep = ms => new Promise(res => setTimeout(res, ms));

async function runLoop() {
    while (true) {
        await run()
        await sleep(PERIOD_SECONDS * 1000)
    }
}

runLoop()