const {
    authenticatedLndGrpc
} = require('ln-service');

const fs = require('fs')
const config = require('./config')

const { lnd } = authenticatedLndGrpc({
    cert: (config.TLS_CERT_FILE && fs.readFileSync(config.TLS_CERT_FILE)) || fs.readFileSync('/home/ubuntu/.lnd/tls.cert'),
    macaroon: (config.MACAROON_FILE && fs.readFileSync(config.MACAROON_FILE)) || fs.readFileSync(`/home/ubuntu/.lnd/data/chain/bitcoin/${config.ENVIRONMENT === 'PRODUCTION' ? 'mainnet' : 'testnet'}/admin.macaroon`),
    socket: config.SOCKET || `localhost:10009`,
});

module.exports = { lnd }