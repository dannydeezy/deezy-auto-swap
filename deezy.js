
const axios = require('axios')
const config = require('./config.json')

const ENV = config.ENVIRONMENT || 'TESTNET'
console.log(`Using environment ${ENV}`)
const DEEZY_URL = `https://api${ENV === 'MAINNET' ? '' : `-testnet`}.deezy.io`

const deezyRequestConfig = config.API_TOKEN ? {
    headers: {
        'x-api-token': config.API_TOKEN
    }
} : {}

async function getSwapInfo() {
    const response = await axios.get(`${DEEZY_URL}/v1/swap/info`, deezyRequestConfig).catch(err => {
        console.log(`Error getting swap info from Deezy: ${err.response.status} ${err.response.statusText}`)
        console.log(err.response.data)
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
    }, deezyRequestConfig).catch(err => {
        console.log(`Error creating swap from Deezy: ${err.response.status} ${err.response.statusText}`)
        console.log(err.response.data)
        return null
    })
    if (!response) return null
    return response.data
}

module.exports = {
    getSwapInfo,
    createSwap
}