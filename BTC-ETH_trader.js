var polo = require("poloniex-unofficial");
var sleep = require('sleep-async')();

// Configure
var coinType = "ETH"
var coinAmount = 0.02
var tradeMargin = 1
var pointDiff = 0.5
var dropCutoff = -20

// Important variables

var coinPair = "BTC_" + coinType
var startPrice = 0

var currentPrice = 0
var lastCurrentPrice = 0
var deltaScore = 0
var lowAskDelta = 0
var highBidDelta = 0

var lastQueueExecuteTime = Date.now()
var actionQueue = []

var lastTickerTimestamp = Date.now()

var activeArr = {} // [gammaId, selling?, lastTransactionValue]
var activeLow = 0
var activeHigh = 0

var salesSoFar = 0
var profitsSoFar = 0

var apiPush = polo.api("push");



//{ gamma0: {selling: '0', lastTransactionValue: '0' } }


function getDelta(newPrice) {
    return (Math.log(newPrice / startPrice) / Math.log(1.01))
}

function getPrice(newDelta) {
    return (startPrice * Math.pow(1.01, newDelta))
}

var apiTrading = polo.api("trading", {
    "key": "REDACTED",
    "secret": "REDACTED"
});




var queueExecute = function() {
    sleep.sleepWithCondition(
        function(){
			return (Date.now() - lastQueueExecuteTime > 250 && actionQueue.length > 0)
		},
        Infinity,
        function(){
            actionQueue[0][0](actionQueue[0][1], actionQueue[0][2])
            actionQueue.splice(0, 1)
            lastQueueExecuteTime = Date.now()
		    queueExecute()
        }
	)
}


queueExecute()



var printData = function() {
    
    var thoseSelling = []
    var totalProfit = profitsSoFar

    for (i = activeLow; i <= activeHigh; i++) {
        if (activeArr[i]['selling'] == 1) {
            thoseSelling.push((i * pointDiff).toFixed(1))
            totalProfit += (coinAmount * currentPrice - activeArr[i]['lastTransactionValue'])
        }
    }
    
    var d = new Date();
            
//    console.log("")
//    
//    console.log(activeArr)
    
    console.log("")

    console.log("BTC_" + coinType +
                " | Start: " + startPrice + 
                " BTC, Now: " + currentPrice + 
                " BTC, Delta Score: " + ("          " + deltaScore.toFixed(4)).slice(-7) +
                " BTC, Delta Low Ask: " + ("          " + lowAskDelta.toFixed(4)).slice(-7) +
                " BTC, Delta High Bid: " + ("          " + highBidDelta.toFixed(4)).slice(-7) +
                "  " + d.toLocaleTimeString()
               );


    console.log("Number of sales: "  + salesSoFar + 
                ", Profit: " + ("             " + (profitsSoFar).toFixed(8)).slice(-11) +
                ", Total profit: " + ("             " + (totalProfit).toFixed(8)).slice(-11) + 
                ", Queue Length: " + actionQueue.length 
               ); 

    console.log("Those selling: " + thoseSelling)
    
}




var startTickerListen = function(){apiPush.ticker((err, response) => {
    lastTickerTimestamp = Date.now()
    //process.stdout.write(".");
    if (err) {
        // Log error message 
        console.log("An update error occurred: " + err.msg);
 
    }
 
    // Log the last price and what pair it was for
    
    if (response.currencyPair == "BTC_" + coinType){
        
        currentPrice = response.last
        
        var i = 0
        
        
        if (startPrice == 0){
            startPrice = response.last;
            activeLow = -20
            activeHigh = 20
            
            for (i = -20; i <= 20; i++) {
                activeArr[i] = {selling: 0, lastTransactionValue: 0 }
                waitForBuy(i)
            }
            /*
            for (i = 1; i < 20; i++) {
                activeArr["gamma" + i] = {selling: '1', lastTransactionValue: '0.000485376' }
                waitForSell(i)
            }*/
            
        }
        
        deltaScore = getDelta(response.last)
        lowAskDelta = getDelta(response.lowestAsk)
        highBidDelta = getDelta(response.highestBid)
        
        
        

        
        
        if (currentPrice != lastCurrentPrice){ 
            printData()
        }
        
        lastCurrentPrice = currentPrice

    }
    
})}

var rebootTicker = function rebootTicker(){
    
    console.log("Ticker rebooted")
    
	startTickerListen()

	sleep.sleepWithCondition(function(){
			return (Date.now() - lastTickerTimestamp > 20000)
		}, Infinity,
		rebootTicker
	)

}

rebootTicker()





var waitForBuy = function(gammaId) {
    
    sleep.sleepWithCondition(
        function(){
            return (lowAskDelta < gammaId * pointDiff)
        },
        Infinity,
        function(){
            //console.log("Gamma: " + gammaId + ", LowAskDelta: " + lowAskDelta + ", pointDiff*: " + gammaId * pointDiff)
            var tryPrice = getPrice(lowAskDelta)
            actionQueue.push([buyCoin, gammaId, tryPrice])
        }
    
    )
}


var buyCoin = function(gammaId, price) {
    
    
    apiTrading.buy(coinPair, price, coinAmount, 1, 0, (err, response) => {
        if (err) {
            // Error
            
            console.log(err)
            
            waitForBuy(gammaId)
            
        } else if (response['resultingTrades'].length > 0) {
            // Bought
            
            console.log()
            
            console.log("Bought " + (gammaId * pointDiff) + " at " + price.toFixed(8) + " (" + getDelta(price).toFixed(4) + "Δ)")
            
            
    
            var buyCostTotal = 0
            
            var i = 0
            
            for (i = 0; i < response['resultingTrades'].length; i++) {
                buyCostTotal += Number(response['resultingTrades'][i]['total'] * 0.9975)
            }
            
            //delete activeArr[gammaId]['lastTransactionValue']
            activeArr[gammaId]['lastTransactionValue'] = buyCostTotal
            
            //activeArr[gammaId]['lastTransactionValue'] = 0.05
            
            activeArr[gammaId]['selling'] = 1
            
            printData()
            
            
            waitForSell(gammaId)
            
        } else {
            waitForBuy(gammaId)
        }
    })
}



var waitForSell = function(gammaId) {
    
    sleep.sleepWithCondition(
        function(){
            return (highBidDelta > gammaId * pointDiff + tradeMargin)
        },
        Infinity,
        function(){
            var tryPrice = getPrice(highBidDelta)
            actionQueue.push([sellCoin, gammaId, tryPrice])
        }
    
    )
}


var sellCoin = function(gammaId, price) {
    
    
    apiTrading.sell(coinPair, price, coinAmount, 1, 0, (err, response) => {
        if (err) {
            // Error
            
            console.log(err)
            
            waitForSell(gammaId)
            
        } else if (response['resultingTrades'].length > 0) {
            // Bought
    
            var sellCostTotal = 0
            
            var i = 0
            
            for (i = 0; i < response['resultingTrades'].length; i++) {
                sellCostTotal += response['resultingTrades'][i]['total']
            }
            
            console.log()
            
            console.log("Sold " + (gammaId * pointDiff) + " at " + price.toFixed(8) + " (" + getDelta(price).toFixed(4) + "Δ), a profit of " + (100 * (sellCostTotal * 0.9985 - activeArr[gammaId]['lastTransactionValue']) / activeArr[gammaId]['lastTransactionValue']) + "%")
            
            activeArr[gammaId]['selling'] = 0
            profitsSoFar += sellCostTotal - activeArr[gammaId]['lastTransactionValue']
            salesSoFar += 1
            
            printData()
            
            waitForBuy(gammaId)
            
        } else {
            waitForSell(gammaId)
        }
    })
}
                   


                   
                   
// apiTrading.buy = function(currencyPair, rate, amount, fillOrKill, immediateOrCancel, callback) {



