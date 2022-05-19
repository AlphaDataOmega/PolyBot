require("dotenv").config(); // get the environment variables file
const config = require("../config.json")

const Big = require('big.js'); //big js changes big numbers to small ones 
const Web3 = require('web3'); //this initializes a web3 library
let web3

if (!config.PROJECT_SETTINGS.isLocal) { //this can be changed in the config file
    web3 = new Web3(`${process.env.ALCHEMY_API_URL}`) //set up a gateway using the environments variables file.
} else {
    web3 = new Web3('ws://127.0.0.1:7545')
}

const { ChainId, Token } = require("@uniswap/sdk") //
const IUniswapV2Pair = require("@uniswap/v2-core/build/IUniswapV2Pair.json")
const IERC20 = require('@openzeppelin/contracts/build/contracts/ERC20.json')

async function getTokenAndContract(_token0Address, _token1Address) {
    const token0Contract = new web3.eth.Contract(IERC20.abi, _token0Address)
    const token1Contract = new web3.eth.Contract(IERC20.abi, _token1Address)

    const token0 = new Token(
        ChainId.MAINNET,
        _token0Address,
        await token0Contract.methods.decimals().call(),
        await token0Contract.methods.symbol().call(),
        await token0Contract.methods.name().call(),
    )

    const token1 = new Token(
        ChainId.MAINNET,
        _token1Address,
        await token1Contract.methods.decimals().call(),
        await token1Contract.methods.symbol().call(),
        await token1Contract.methods.name().call(),
    )

    return { token0Contract, token1Contract, token0, token1 }
}

//Here we are going to make sure that there is a pool with the tokens that we are using within the flashloan provider's pool factory.
async function getFlashLoanPool(_flashLoan, _token0Address, _token1Address ) {

    //First, we will let the user know what is going on. So we will log out a message to the console.
    console.log(' Checking FlashLoan Provider for a Pool to Borrow from..' )

    //Here we will call to the flashloan contract using the methods keyword which will envoke the getDODOPool function that 
    //requires the stable token address and the volatile token address.
    //Then we will send the call using the call() function.
    const flashLoanPool = await _flashLoan.methods.getDODOPool(_token0Address, _token1Address ).call()
    
    if (!flashLoanPool) {
        console.log('There is no pool available to borrow from... Choose a different pair...')
        return false
    }

    return flashLoanPool 
}

async function getPairAddress(_V2Factory, _token0, _token1) {
    const pairAddress = await _V2Factory.methods.getPair(_token0, _token1).call()
    return pairAddress
}

async function getPairContract(_V2Factory, _token0, _token1) {
    const pairAddress = await getPairAddress(_V2Factory, _token0, _token1)
    const pairContract = new web3.eth.Contract(IUniswapV2Pair.abi, pairAddress)
    return pairContract
}

async function getReserves(_pairContract, _token0, _token1) {
    const reserves = await _pairContract.methods.getReserves().call()
    reservesToken0 = await _pairContract.methods.token0().call()
    if (reservesToken0 === _token0.address) {
        return [reserves.reserve0, reserves.reserve1]
    } else {
        return [reserves.reserve1, reserves.reserve0]
    }
}

async function calculatePrice(_pairContract, _token0, _token1) {
    let [reserve0, reserve1] = await getReserves(_pairContract, _token0, _token1)
    reserve0 = reserve0 / Math.pow(10, _token0.decimals)
    reserve1 = reserve1 / Math.pow(10, _token1.decimals)
    return Big(reserve0).div(Big(reserve1)).toString()
}

function calculateDifference(uPrice, sPrice) {
    return (((uPrice - sPrice) / sPrice) * 100).toFixed(2)
}

async function getEstimatedReturn(amount, _routerPath, _token0, _token1) {

    const trade1 = await _routerPath[0].methods.getAmountsOut(amount, [_token0.address, _token1.address]).call()

    console.log(`trade1: ${trade1}`)

    const trade2 = await _routerPath[1].methods.getAmountsOut(trade1[1], [_token1.address, _token0.address]).call()

    console.log(`trade2: ${trade2}`)

    const amountIn = trade1[0] //Number(web3.utils.fromWei(trade1[0], 'ether'))
    const amountOut = trade2[1] //Number(web3.utils.fromWei(trade2[1], 'ether'))

    return { amountIn, amountOut }
}

module.exports = {
    getTokenAndContract,
    getPairAddress,
    getPairContract,
    getFlashLoanPool,
    getReserves,
    calculatePrice,
    calculateDifference,
    getEstimatedReturn
}