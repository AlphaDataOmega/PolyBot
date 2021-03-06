// SPDX-License-Identifier: MIT
pragma solidity <=0.8.13;

import "@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IDODO {
    function flashLoan(
        uint256 baseAmount,
        uint256 quoteAmount,
        address assetTo,
        bytes calldata data
    ) external;

    function _BASE_TOKEN_() external view returns (address);
}


contract Arbitrage {
    IUniswapV2Router02 public immutable sRouter;
    IUniswapV2Router02 public immutable uRouter;

    address public owner;

    constructor(address _sRouter, address _uRouter) {
        sRouter = IUniswapV2Router02(_sRouter); // Sushiswap
        uRouter = IUniswapV2Router02(_uRouter); // Uniswap
        owner = msg.sender;
    }

    // It's easy to get lost so here is the basic route of the FlashLoan
    // dodoFlashLoan() => IDODO._BASE_TOKEN_() => DDPFlashLoanCall() => _FlashLoanCallBack()

    function dodoFlashLoan(
    address flashLoanPool, //You will make a flashloan from this DODOV2 pool
    address loanToken,
    uint256 loanAmount,
    
    // These are extra parameters we want to send through the dodoFlashLoan() function. 
    // These will be passed back from IDODO _BASE_TOKEN_() function to 
    // the correct ***FlashLoanCall() function based on the pool address provided.

    bool startOnUniswap,
    address token1,
    uint256 balanceBefore 

    ) internal  {

        // Custom Structured Data
        bytes memory data = abi.encode(flashLoanPool, loanToken, loanAmount, startOnUniswap, token1, balanceBefore);

        //DODO 
        address flashLoanBase = IDODO(flashLoanPool)._BASE_TOKEN_();
        if(flashLoanBase == loanToken) {
            IDODO(flashLoanPool).flashLoan(loanAmount, 0, address(this), data);
        } else {
            IDODO(flashLoanPool).flashLoan(0, loanAmount, address(this), data);
        }
    }

    function executeTrade(
        address _flashLoanPool,
        bool _startOnUniswap,
        address _token0,
        address _token1,
        uint256 _flashAmount
    ) external {
        //Set Extra Variables for Custom Data
        uint256 balanceBefore = IERC20(_token0).balanceOf(address(this));

        //Call FlashLoan with required and extra parameters. That have been sent by executeTrade() parameters.
        // On execution the dodoFlashLoan should trigger callback function based on the Factory Contract
        // that contains the pool specified by _flashLoanPool
        dodoFlashLoan(_flashLoanPool, _token0, _flashAmount, _startOnUniswap, _token1, balanceBefore); 
    }

    //  function DVMFlashLoanCall(
    //     address sender, 
    //     uint256 baseAmount, 
    //     uint256 quoteAmount,
    //     bytes calldata data
    //     ) external {
    //     _flashLoanCallBack(sender, baseAmount, quoteAmount, data);
    // }

    //Note: CallBack function executed by DODOV2(DPP) flashLoan pool
    function DPPFlashLoanCall(
        address sender,
        uint256 baseAmount,
        uint256 quoteAmount,
        bytes calldata data
           ) external {
        _flashLoanCallBack(sender, baseAmount, quoteAmount, data);
    }

    // //Note: CallBack function executed by DODOV2(DSP) flashLoan pool
    // function DSPFlashLoanCall(
    //     address sender, 
    //     uint256 baseAmount, 
    //     uint256 quoteAmount,
    //     bytes calldata data
    //      ) external {
    //     _flashLoanCallBack(sender,baseAmount,quoteAmount,data);
    // }


    function _flashLoanCallBack(
        address sender, 
        uint256, 
        uint256,
        bytes calldata data
        ) internal {
        (
            address flashLoanPool,
            address token0,
            uint256 flashAmount,
            bool startOnUniswap,
            address token1,
            uint256 balanceBefore
        ) = abi.decode(data, (address, address, uint256, bool, address, uint256));

        //Added
        uint256 balanceAfter = IERC20(token0).balanceOf(address(this));

        require(
            sender == address(this) && msg.sender == flashLoanPool, 
            "HANDLE_FLASH_DENIED"
        );

        // Make sure that there is enough tokens in 
        // the msg.senderaccount.
        require(balanceAfter - balanceBefore == flashAmount, "contract did not get the loan");

        // Set an in-memory array variable called path that 
        // will hold two addresses in an Array.
        address[] memory path = new address[](2);

        path[0] = token0;
        path[1] = token1;

        if (startOnUniswap) {
            _swapOnUniswap(path, flashAmount, 0);

            path[0] = token1;
            path[1] = token0;

            _swapOnSushiswap(
                path,
                IERC20(token1).balanceOf(address(this)),
                (flashAmount + 1)
            );
        } else {
            _swapOnSushiswap(path, flashAmount, 0);

            path[0] = token1;
            path[1] = token0;

            _swapOnUniswap(
                path,
                IERC20(token1).balanceOf(address(this)),
                (flashAmount + 1)
            );
        }

        // Withdraw Profit
        IERC20(token0).transfer(owner, IERC20(token0).balanceOf(address(this)) - (flashAmount + 1));
        
        // Payback Flashloan
        IERC20(token0).transfer(flashLoanPool, flashAmount);
    }

    // -- INTERNAL FUNCTIONS -- //

    function _swapOnUniswap(
        address[] memory _path,
        uint256 _amountIn,
        uint256 _amountOut
    ) internal {

        // Here is where we could hard code a router address,
        // It would look something like this...

        // IUniswapV2Router02 public uRouter;
        // uRouter = IUniswapV2Router02(_uRouter); 

        require(
            // Get Approval For Swap
            IERC20(_path[0]).approve(address(uRouter), _amountIn),
            "Uniswap approval failed."
        );

        //Perform the Swap
        uRouter.swapExactTokensForTokens(
            _amountIn,
            _amountOut,
            _path,
            address(this),
            (block.timestamp + 1200)
        );
    }

    function _swapOnSushiswap(
        address[] memory _path,
        uint256 _amountIn,
        uint256 _amountOut
    ) internal {

        // Here is where we could hard code a router address,
        // It would look something like this...

        // IUniswapV2Router02 public sRouter;
        // sRouter = IUniswapV2Router02(_sRouter); 

        require(
            //Get Approval for Swap
            IERC20(_path[0]).approve(address(sRouter), _amountIn),
            "Sushiswap approval failed."
        );

        sRouter.swapExactTokensForTokens(
            _amountIn,
            _amountOut,
            _path,
            address(this),
            (block.timestamp + 1200)
        );
    }
} // END of Contract Arbitrage