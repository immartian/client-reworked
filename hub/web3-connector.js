const Promise = require('bluebird');
var Web3 = require('web3');
var fs = require('fs');
var loggerAddress = "0x525eA72A00f435765CC8af6303Ff0dB4cBaD4E44";
var loggerMvp2Abi = JSON.parse(fs.readFileSync('solidity/mvp2/MusicoinLogger.sol.abi'));
var pppMvp2Abi = JSON.parse(fs.readFileSync('solidity/mvp2/PayPerPlay.sol.abi'));
var pppMvp2Code = "0x" + fs.readFileSync('solidity/mvp2/PayPerPlay.sol.bin');
var workCode = "0x" + fs.readFileSync('solidity/mvp2/Work.sol.bin');
var workAbi = JSON.parse(fs.readFileSync('solidity/mvp2/Work.sol.abi'));
var deployGas = 4700000;

function Web3Connector(chainConfig) {
  this.web3 = new Web3();
  console.log("connecting to web3")
  this.web3.setProvider(new this.web3.providers.HttpProvider(chainConfig.rpcServer));
  loggerAddress = chainConfig.loggerAddress;
  this.selectedAccount = this.getDefaultAccount();
  this.storedPassword = null;
}

Web3Connector.prototype.hasCredentials = function() {
  return this.storedPassword != null;
};

Web3Connector.prototype.storeCredentials = function (pwd) {
  return this.unlockAccount(pwd)
    .then(function () {
      this.storedPassword = pwd;
    }.bind(this))
};

Web3Connector.prototype.setSelectedAccount = function(account) {
  return new Promise(function(resolve, reject) {
    if (this.web3.eth.accounts.indexOf(account) > -1) {
      this.storedPassword = null;
      this.selectedAccount = account;
      resolve(account);
    }
    else {
      reject(new Error("The given account does not exists: " + account));
    }
  }.bind(this));
};

Web3Connector.prototype.createAccount = function (pwd) {
  return new Promise(function(resolve, reject) {
    try {
      var newAccount = this.web3.personal.newAccount(pwd);
      this.storedPassword = pwd;

      // TODO: user needs to be able to select this on login.
      this.selectedAccount = newAccount;
      return resolve(newAccount);
    } catch (e) {
      reject(e);
    }
  }.bind(this));
};

Web3Connector.prototype.getSelectedAccount = function () {
  return this.selectedAccount;
};

Web3Connector.prototype.getAccounts = function () {
  return this.web3.eth.accounts;
};

Web3Connector.prototype.getDefaultAccount = function () {
  return this.web3.eth.defaultAccount || this.web3.eth.accounts[0];
};

Web3Connector.prototype.getUserBalanceInMusicoin = function () {
  return new Promise(function(resolve, reject) {
    this.web3.eth.getBalance(this.selectedAccount, function(err, result) {
      if (err) {
        reject(err);
      }
      else {
        resolve(this.toMusicCoinUnits(result));
      }
    }.bind(this));
  }.bind(this));
};

Web3Connector.prototype.getWeiPerPlay = function (address) {
  return this.getLicenseContractInstance(address).weiPerPlay();
};

Web3Connector.prototype.ppp = function (pppRequest) {
  return this.unlockAccount()
    .bind(this)
    .then(function(account) {
      var contract = this.getLicenseContractInstance(pppRequest.to);
      var params = {from: account, value: pppRequest.amount, gas: 940000};
      return new Promise(function(resolve, reject) {
        contract.play(params, function (err, tx) {
          if (err) reject(err);
          else resolve(tx);
        });
      })
    })
};

Web3Connector.prototype.tip = function (tipRequest) {
  return this.unlockAccount()
    .bind(this)
    .then(function(account) {
      var contract = this.getLicenseContractInstance(tipRequest.to);
      var params = {from: account, value: tipRequest.amount, gas: 940000};
      return new Promise(function(resolve, reject) {
        contract.tip(params, function (err, tx) {
          if (err) reject(err);
          else resolve(tx);
        });
      })
    })
};

Web3Connector.prototype.send = function (tipRequest) {
  return this.unlockAccount()
    .bind(this)
    .then(function(account) {
      var params = {to: tipRequest.to, from: account, value: tipRequest.amount, gas: 940000};
      return new Promise(function(resolve, reject) {
        return this.web3.eth.sendTransaction(params, function (err, tx) {
          if (err) reject(err);
          else resolve(tx);
        });
      }.bind(this))
    })
};

Web3Connector.prototype.unlockAccount = function (overridePwd) {
  console.log("Unlocking account...");
  return new Promise(function (resolve, reject) {
    var account = this.selectedAccount;
    this.web3.personal.unlockAccount(account, overridePwd || this.storedPassword, 10, function(err, result) {
      if (result) {
        resolve(account);
      }
      else {
        reject(new Error("Unlocking account failed: " + err));
      }
    });
  }.bind(this));
};

Web3Connector.prototype.getLicenseContractInstance = function (address) {
  return this.web3.eth.contract(this.getContractAbiFromCatalog(address)).at(address);
};

Web3Connector.prototype.getWorkContractInstance = function (address) {
  return this.web3.eth.contract(workAbi).at(address);
};

Web3Connector.prototype.getContractAbiFromCatalog = function (address) {
  // TODO: The abi of contracts will change depending on the version
  return pppMvp2Abi;
};

Web3Connector.prototype.toMusicCoinUnits = function (indivisibleUnits) {
  return this.web3.fromWei(indivisibleUnits, 'ether');
};

Web3Connector.prototype.toIndivisibleUnits = function (musicCoins) {
  return this.web3.toWei(musicCoins, 'ether');
};

Web3Connector.prototype.listLicensesForWork = function (workAddress) {
  return new Promise(function (resolve, reject) {
    var loggerContract = this.web3.eth.contract(loggerMvp2Abi).at(loggerAddress);
    var block = this.web3.eth.blockNumber;
    var filter = loggerContract.licenseReleasedEvent({work: workAddress}, {fromBlock: 0, toBlock: block});

    // TODO: The filter above doesn't seem to work -- maybe they need to be indexed?
    var actualFilter = function (log) {
      return log.args.work == workAddress;
    }

    filter.get(function (error, logs) {
      if (error) reject(error);
      resolve(logs.filter(actualFilter).map(function (log) {
        return log.args.sender
      }));
    });
  }.bind(this));
};

Web3Connector.prototype.listRecentLicenses = function (numBlocks) {
  return new Promise(function (resolve, reject) {
    var loggerContract = this.web3.eth.contract(loggerMvp2Abi).at(loggerAddress);
    var block = this.web3.eth.blockNumber;
    var filter = loggerContract.licenseReleasedEvent({}, {fromBlock: block - numBlocks, toBlock: block});
    filter.get(function (error, logs) {
      if (error) reject(error);
      resolve(logs.map(function (log) {
        return log.args.sender
      }));
    });
  }.bind(this));
};

Web3Connector.prototype.listWorksForOwner = function (ownerAddress) {
  return new Promise(function (resolve, reject) {
    var loggerContract = this.web3.eth.contract(loggerMvp2Abi).at(loggerAddress);
    var block = this.web3.eth.blockNumber;
    var filter = loggerContract.workReleasedEvent({owner: ownerAddress}, {fromBlock: block - 10000, toBlock: block});
    var actualFilter = function (log) {
      return log.args.owner == ownerAddress;
    }
    filter.get(function (error, logs) {
      if (error) reject(error);
      resolve(logs.filter(actualFilter).map(function (log) {
        return log.args.sender
      }));
    });
  }.bind(this));
};

Web3Connector.prototype.waitForTransaction = function (expectedTx) {
  return new Promise(function(resolve, reject) {
    var count = 0;
    var filter = this.web3.eth.filter('latest');
    filter.watch(function (error, result) {
      if (error) console.log("Error: " + error);
      if (result) console.log("Result: " + result);
      count++;

      if (count > 5) {
        console.log("Giving up on tx " + expectedTx);
        reject(new Error("Transaction was not confirmed"));
        filter.stopWatching();
      }

      // each time a new block comes in, see if our tx is in it
      this.web3.eth.getTransactionReceipt(expectedTx, function(error, receipt) {
        if (receipt && receipt.transactionHash == expectedTx) {
          this.web3.eth.getTransaction(expectedTx, function (error, transaction) {
            if (transaction.gas == receipt.gasUsed) {
              // wtf?! This is the only way to check for an error??
              filter.stopWatching();
              reject(new Error("Out of gas (or an error was thrown)"));
            }
            else if (receipt.blockHash) {
              console.log("Confirmed " + expectedTx);
              console.log("Block hash " + receipt.blockHash);
              filter.stopWatching();
              resolve(receipt);
            }
            else {
              console.log("Waiting for confirmation of " + expectedTx);
            }
          }.bind(this));
        }
      }.bind(this));
    }.bind(this));
  }.bind(this));
};

Web3Connector.prototype.loadHistory = function () {
  return new Promise(function (resolve, reject) {
    var block = this.web3.eth.blockNumber
    resolve(this.getTransactionsByAccount(this.getSelectedAccount(), block-1000, block));
  }.bind(this));
};

Web3Connector.prototype.getTransactionsByAccount = function getTransactionsByAccount(myaccount, startBlockNumber, endBlockNumber) {
  if (endBlockNumber == null) {
    endBlockNumber = this.web3.eth.blockNumber;
    console.log("Using endBlockNumber: " + endBlockNumber);
  }
  if (startBlockNumber == null) {
    startBlockNumber = endBlockNumber - 1000;
    console.log("Using startBlockNumber: " + startBlockNumber);
  }
  console.log("Searching for transactions to/from account \"" + myaccount + "\" within blocks "  + startBlockNumber + " and " + endBlockNumber);

  var output = [];
  for (var i = startBlockNumber; i <= endBlockNumber; i++) {
    if (i % 1000 == 0) {
      console.log("Searching block " + i);
    }
    var block = this.web3.eth.getBlock(i, true);
    if (block != null && block.transactions != null) {
      block.transactions.forEach( function(e) {
        if (myaccount == e.from || myaccount == e.to) {
          output.push(e);
        }
      })
    }
  }
  return output;
};

Web3Connector.prototype.releaseWork = function (work) {
  return this.unlockAccount()
    .bind(this)
    .then(function(account) {
      var workContract = this.web3.eth.contract(workAbi);
      return new Promise(function (resolve, reject) {
        workContract.new(
          loggerAddress,
          work.type,
          work.title,
          work.artist,
          work.imageUrl,
          work.metadataUrl,
          {
            from: account,
            data: workCode,
            gas: deployGas
          }, function (e, contract) {
            if (e) {
              reject(e);
            }
            else if (contract.address) {
              resolve(contract.address);
            }
            else {
              console.log("Got transaction hash: " + contract.transactionHash);
            }
          });
      })
    })
};

Web3Connector.prototype.releaseLicense = function (releaseRequest) {
  return this.unlockAccount()
    .then(function (account) {
      var payperplayContract = this.web3.eth.contract(pppMvp2Abi);
      return new Promise(function (resolve, reject) {
        payperplayContract.new(
          loggerAddress,
          releaseRequest.workAddress,
          this.toIndivisibleUnits(releaseRequest.coinsPerPlay),
          releaseRequest.resourceUrl,
          releaseRequest.metadataUrl,
          releaseRequest.royalties,
          releaseRequest.royaltyAmounts.map(this.toIndivisibleUnits),
          releaseRequest.contributors,
          releaseRequest.contributorShares,
          {
            from: account,
            data: pppMvp2Code,
            gas: deployGas
          }, function (e, contract) {
            if (e) {
              reject(e);
            }
            else if (contract.address) {
              resolve(contract.address);
            }
            else {
              console.log("Got transaction hash: " + contract.transactionHash);
            }
          }.bind(this));
      }.bind(this))
    }.bind(this))
};

module.exports = Web3Connector;
