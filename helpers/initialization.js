require("dotenv").config();
const config = require('../config.json')

const Web3 = require('web3')
let web3

if (!config.PROJECT_SETTINGS.isLocal) {
    web3 = new Web3(`${process.env.ALCHEMY_API_URL}`)
} else {
    web3 = new Web3('ws://127.0.0.1:7545')
}

const IUniswapV2Router02 = require('@uniswap/v2-periphery/build/IUniswapV2Router02.json')
const IUniswapV2Factory = require("@uniswap/v2-core/build/IUniswapV2Factory.json")
const DODOFactory = require("../build/contracts/DODOFactory.json")

//This is the place where we will get the pool address of the correct pool Factory for the flash loan provided by DODOex.io
//We will use this to get the correct pool address for the two tokens we are using.
//TODO Should make this part dynamic determined on the provider of the flashloan and the contract that is needed. 
const flashLoan = new web3.eth.Contract(DODOFactory.abi, "0xd24153244066F0afA9415563bFC7Ba248bfB7a51"); //Polygon DDPFactory from DODOex.io

const uFactory = new web3.eth.Contract(IUniswapV2Factory.abi, config.UNISWAP.FACTORY_ADDRESS) // UNISWAP FACTORY CONTRACT
const uRouter = new web3.eth.Contract(IUniswapV2Router02.abi, config.UNISWAP.V2_ROUTER_02_ADDRESS) // UNISWAP ROUTER CONTRACT
const sFactory = new web3.eth.Contract(IUniswapV2Factory.abi, config.SUSHISWAP.FACTORY_ADDRESS) // SUSHISWAP FACTORY CONTRACT
const sRouter = new web3.eth.Contract(IUniswapV2Router02.abi, config.SUSHISWAP.V2_ROUTER_02_ADDRESS) // SUSHISWAP ROUTER CONTRACT

const IArbitrage = require( "../build/contracts/Arbitrage.json");
const arbitrage = new web3.eth.Contract(IArbitrage.abi, "0x885029fFF91541438a3f405538161F75912270a7");

module.exports = {
    flashLoan,
    uFactory,
    uRouter,
    sFactory,
    sRouter,
    web3,
    arbitrage
}