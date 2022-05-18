// -- HANDLE INITIAL SETUP -- //

require('./helpers/server') //Get the server config file
require("dotenv").config(); //Get the environment variables file

const config = require('./config.json') //get the main config options file

const { getTokenAndContract, /* getFlashLoanPool, */ getPairContract, calculatePrice, getEstimatedReturn, getReserves } = require('./helpers/helpers') //get these variables from the helpers file
const { /*flashLoan,*/ uFactory, uRouter, sFactory, sRouter, web3, arbitrage } = require('./helpers/initialization') //get these variables from initialization file

// -- .ENV VALUES HERE -- //

const arbFor = process.env.ARB_FOR // This is the address of token we are attempting to arbitrage (WETH)
const arbAgainst = process.env.ARB_AGAINST // SHIB
const account = process.env.ACCOUNT // Account to recieve profit
const units = process.env.UNITS // Used for price display/reporting
const difference = process.env.PRICE_DIFFERENCE
const gas = process.env.GAS_LIMIT
const estimatedGasCost = process.env.GAS_PRICE // Estimated Gas: 0.008453220000006144 ETH + ~10%

let uPair, sPair, amount
let isExecuting = false

const main = async () => {
    const { token0Contract, token1Contract, token0, token1 } = await getTokenAndContract(arbFor, arbAgainst)
    uPair = await getPairContract(uFactory, token0.address, token1.address)
    sPair = await getPairContract(sFactory, token0.address, token1.address)

    //After we know that there are pools with the tokens we are hoping to use, next we need to make sure that the
    //flashloan provider has a pool that contains those two tokens as well. 
    //flashLoanPool = await getFlashLoanPool( flashLoan, token0.address, token1.address )

    uPair.events.Swap({}, async () => {
        if (!isExecuting) {
            isExecuting = true

            const priceDifference = await checkPrice('Uniswap', token0, token1)
            const routerPath = await determineDirection(priceDifference)

            if (!routerPath) {
                console.log(`No Arbitrage Currently Available\n`)
                console.log(`-----------------------------------------\n`)
                isExecuting = false
                return
            }

            const isProfitable = await determineProfitability(routerPath, token0Contract, token0, token1)

            if (!isProfitable) {
                console.log(`No Arbitrage Currently Available\n`)
                console.log(`-----------------------------------------\n`)
                isExecuting = false
                return
            }

            const receipt = await executeTrade(routerPath, token0Contract, token1Contract)

            isExecuting = false
        }
    })

    sPair.events.Swap({}, async () => {
        if (!isExecuting) {
            isExecuting = true

            const priceDifference = await checkPrice('Sushiswap', token0, token1)
            const routerPath = await determineDirection(priceDifference)

            if (!routerPath) {
                console.log(`No Arbitrage Currently Available\n`)
                console.log(`-----------------------------------------\n`)
                isExecuting = false
                return
            }

            const isProfitable = await determineProfitability(routerPath, token0Contract, token0, token1)

            if (!isProfitable) {
                console.log(`No Arbitrage Currently Available\n`)
                console.log(`-----------------------------------------\n`)
                isExecuting = false
                return
            }

            const receipt = await executeTrade(routerPath, token0Contract, token1Contract)

            console.log(receipt)

            isExecuting = false
        }
    })

    console.log("Waiting for swap event...")
}






const checkPrice = async (exchange, token0, token1) => {
    isExecuting = true

    console.log(`Swap Initiated on ${exchange}, Checking Price...\n`)

    const currentBlock = await web3.eth.getBlockNumber()

    const uPrice = await calculatePrice(uPair)
    const sPrice = await calculatePrice(sPair)

    const uFPrice = Number(uPrice).toFixed(units)
    const sFPrice = Number(sPrice).toFixed(units)
    const priceDifference = (((uFPrice - sFPrice) / sFPrice) * 100).toFixed(2)

    console.log(`Current Block: ${currentBlock}`)
    console.log(`-----------------------------------------`)
    console.log(`UNISWAP   | ${token1.symbol}/${token0.symbol}\t | ${uFPrice}`)
    console.log(`SUSHISWAP | ${token1.symbol}/${token0.symbol}\t | ${sFPrice}\n`)
    console.log(`Percentage Difference: ${priceDifference}%\n`)
    // console.log(`Token0 Decimals | ${token0.decimals}\n`)
    // console.log(`Token1 Decimals | ${token1.decimals}`)

    return priceDifference
}

const determineDirection = async (priceDifference) => {
    console.log(`Determining Direction...\n`)

    if (priceDifference >= difference) {

        console.log(`Potential Arbitrage Direction:\n`)
        console.log(`Buy\t -->\t Uniswap`)
        console.log(`Sell\t -->\t Sushiswap\n`)
        return [uRouter, sRouter]

    } else if (priceDifference <= -(difference)) {

        console.log(`Potential Arbitrage Direction:\n`)
        console.log(`Buy\t -->\t Sushiswap`)
        console.log(`Sell\t -->\t Uniswap\n`)
        return [sRouter, uRouter]

    } else {
        return null
    }
}

const determineProfitability = async (_routerPath, _token0Contract, _token0, _token1) => {

    console.log(`Determining Profitability...\n`)

    // This is where you can customize your conditions on whether a profitable trade is possible.
    // This is a basic example of trading WETH/SHIB...

    let reserves, exchangeToBuy, exchangeToSell

    if (_routerPath[0]._address == uRouter._address) {
        reserves = await getReserves(sPair)
        exchangeToBuy = 'Uniswap'
        exchangeToSell = 'Sushiswap'
    } else {
        reserves = await getReserves(uPair)
        exchangeToBuy = 'Sushiswap'
        exchangeToSell = 'Uniswap'
    }

    console.log(`Reserves on ${_routerPath[1]._address}`)
    console.log(`${_token0.name}: ${reserves[0]}`)
    console.log(`${_token1.name}: ${reserves[1]}\n`)
    
    console.log(`Token 0 Reserves 0 Decimals ${_token0.decimals}: ${reserves[0] /= Math.pow(10, _token0.decimals).toFixed(0)}`)
    console.log(`Token 1 Reserves 1 Decimals ${_token1.decimals}: ${reserves[1] /= Math.pow(10, _token1.decimals).toFixed(0)}\n`) //${Number(web3.utils.fromWei(reserves[1].toString(), 'ether'))}\n`)

    console.log(`Token 1 Reserves 0 Decimals ${_token1.decimals}: ${reserves[0] /= Math.pow(10, _token1.decimals).toFixed(0)}`)
    console.log(`Token 0 Reserves 1 Decimals ${_token0.decimals}: ${reserves[1] /= Math.pow(10, _token0.decimals).toFixed(0)}\n`)
    
    //try {

        //Number(web3.utils.fromWei(reserves[0]), 'ether').toFixed(0)

    // try {
    //     let result = await _routerPath[0].methods.getAmountsIn(reserves[0], [_token0.address, _token1.address]).call()
    // } catch(error) {
        //reserves[0] = reserves[0] /= Math.pow(10, _token0.decimals).toFixed(0)

        //console.log(reserves[0])

        let result = await _routerPath[0].methods.getAmountsIn(reserves[0], [_token0.address, _token1.address]).call()
    // }

        //console.log(result)


        const token0In = result[0] // WETH
        const token1In = result[1] // SHIB

        //console.log(`token1In: ${token1In}`)

        result = await _routerPath[1].methods.getAmountsOut(token1In, [_token1.address, _token0.address]).call()

        //console.log(result)

        console.log(`Estimated amount of ${_token0.symbol} needed to buy enough ${_token1.symbol} on ${exchangeToBuy}\t| ${token0In}`)
        console.log(`Estimated amount of ${_token0.symbol} returned after swapping ${_token1.symbol} on ${exchangeToSell}\t| ${result[1]} \n`)

        const { amountIn, amountOut } = await getEstimatedReturn(token0In, _routerPath, _token0, _token1)

        let ethBalanceBefore = await web3.eth.getBalance(account)
        ethBalanceBefore = web3.utils.fromWei(ethBalanceBefore, 'ether')
        const ethBalanceAfter = ethBalanceBefore - estimatedGasCost

        const amountDifference = amountOut - amountIn
        let wethBalanceBefore = await _token0Contract.methods.balanceOf(account).call()
        wethBalanceBefore = wethBalanceBefore /= Math.pow(10, _token0.decimals).toFixed(0)

        const wethBalanceAfter = amountDifference + Number(wethBalanceBefore)
        const wethBalanceDifference = wethBalanceAfter - Number(wethBalanceBefore)

        const totalGained = wethBalanceDifference - Number(estimatedGasCost)

        const data = {
            'ETH Balance Before': ethBalanceBefore,
            'ETH Balance After': ethBalanceAfter,
            'ETH Spent (gas)': estimatedGasCost,
            '-': {},
            'WETH Balance BEFORE': wethBalanceBefore,
            'WETH Balance AFTER': wethBalanceAfter,
            'WETH Gained/Lost': wethBalanceDifference,
            '-': {},
            'Total Gained/Lost': totalGained
        }

        console.table(data)
        console.log()

        if (amountOut < amountIn) {
            return false
        }

        amount = token0In
        return true

    // } catch (error) {
    //     console.log(error.data.stack)
    //     console.log(`\nError occured while trying to determine profitability...\n`)
    //     console.log(`This can typically happen because an issue with reserves, see README for more information.\n`)
    //     return false
    // }
}

const executeTrade = async (_routerPath, _token0Contract, _token1Contract) => {
    console.log(`Attempting Arbitrage...\n`)

    const flashLoanPool = process.env.DODO_DDP_FLASHLOAN_POOL

    let startOnUniswap

    if (_routerPath[0]._address == uRouter._address) {
        startOnUniswap = true
    } else {
        startOnUniswap = false
    }

    // Fetch token balance before
    const balanceBefore = await _token0Contract.methods.balanceOf(account).call()
    const ethBalanceBefore = await web3.eth.getBalance(account)

    if (config.PROJECT_SETTINGS.isDeployed) {
        await _token0Contract.methods.approve(arbitrage._address, amount).send({ from: account })
        await arbitrage.methods.executeTrade(flashLoanPool, startOnUniswap, _token0Contract._address, _token1Contract._address, amount).send({ from: account, gas: gas })
    }

    console.log(`Trade Complete:\n`)

    // Fetch token balance after
    const balanceAfter = await _token0Contract.methods.balanceOf(account).call()
    const ethBalanceAfter = await web3.eth.getBalance(account)

    const balanceDifference = balanceAfter - balanceBefore
    const totalSpent = ethBalanceBefore - ethBalanceAfter

    const data = {
        'ETH Balance Before': web3.utils.fromWei(ethBalanceBefore, 'ether'),
        'ETH Balance After': web3.utils.fromWei(ethBalanceAfter, 'ether'),
        'ETH Spent (gas)': web3.utils.fromWei((ethBalanceBefore - ethBalanceAfter).toString(), 'ether'),
        '-': {},
        'WETH Balance BEFORE': web3.utils.fromWei(balanceBefore.toString(), 'ether'),
        'WETH Balance AFTER': web3.utils.fromWei(balanceAfter.toString(), 'ether'),
        'WETH Gained/Lost': web3.utils.fromWei(balanceDifference.toString(), 'ether'),
        '-': {},
        'Total Gained/Lost': `${web3.utils.fromWei((balanceDifference - totalSpent).toString(), 'ether')} ETH`
    }

    console.table(data)
}

main()
