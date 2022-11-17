
const axios = require('axios')
const config = require('./config')

const ENV = config.ENVIRONMENT || 'TESTNET'
console.log(`Using environment ${ENV}`)
const DEEZY_URL = `https://api${ENV === 'MAINNET' ? '' : `-testnet`}.deezy.io`

async function getSwapInfo() {
    const response = await axios.get(`${DEEZY_URL}/v1/swap/info`).catch(err => {
        console.log(`Error getting swap info: ${err.response.status} ${err.response.statusText}`)
        return null
    })
    if (!response) return null
    return response.data
}

async function createSwap({ amount_sats, on_chain_address, on_chain_sats_per_vbyte }) {
    const response = await axios.post(`${DEEZY_URL}/v1/swap`, {
        amount_sats,
        on_chain_address,
        on_chain_sats_per_vbyte
    }).catch(err => {
        console.log(`Error creating swap: ${err.response.status} ${err.response.statusText}`)
        return null
    })
    if (!response) return null
    return response.data
}

module.exports = {
    getSwapInfo,
    createSwap
}