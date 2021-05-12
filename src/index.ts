import { userInfo, tokenAddres, ContractAddress } from "./lib_const";
import { ERC20, MULBANK } from "./lib_abi";
import {
  add, sub, mul, div, web3, Trace, findToken, getDecimal, convertBigNumberToNormal, convertNormalToBigNumber, executeContract,
  addMetamaskChain as _addMetamaskChain, toPrecision as _toPrecision, logout as _logout, sleep as _sleep, connect as _connect,
  getBalance as _getBalance, getAllowance as _getAllowance, approveToken as _approveToken, isETHAddress as _isETHAddress
} from "./lib.utils";

export const T = Trace;
export const sleep = _sleep;
export const logout = _logout;
export const connect = _connect;
export const getBalance = _getBalance;
export const toPrecision = _toPrecision;
export const isETHAddress = _isETHAddress;
export const addMetamaskChain = _addMetamaskChain;

export var rankList: { data: [] };
/**
 * 根据token symbol获取address
 * @param token_symbol 
 * @returns 
 */
export function getTokenAddress(token_symbol: string) {
  return tokenAddres[userInfo.chainID][token_symbol as keyof typeof tokenAddres[128]];
}
/**
 * 根据token address,获取symbol
 * @param token_address 
 * @returns 
 */
export function getTokenSymbol(token_address: string) {
  let symbol = findToken(tokenAddres[userInfo.chainID], token_address);
  return symbol || "not know";
}
/**
 * 获取授权值
 * @param token_address 
 * @returns 
 */
export async function getAllowance(token_address: string) {
  let destina_address = ContractAddress[userInfo.chainID].mulBank;
  return await _getAllowance(token_address, destina_address);
}
//---------------------------------------------------上查下操作------------------------------------------------------
/**
 * 对token授权
 * @param token_address 
 * @param callback 
 */
export async function approveToken(token_address: string, callback: (code: number, hash: string) => void) {
  let destina_address = ContractAddress[userInfo.chainID].mulBank;
  _approveToken(token_address, destina_address, callback);
}
/**
 * deposit买入
 * @param token_address 
 * @param amount 
 * @param callback 
 */
export async function deposit(token_address: string, amount: string, callback: (code: number, hash: string) => void) {
  let mulBankContract = new web3.eth.Contract(MULBANK, ContractAddress[userInfo.chainID].mulBank);
  let bigAmount = convertNormalToBigNumber(amount, 18);
  executeContract(mulBankContract, "deposit", 0, [token_address, bigAmount], callback);
}
/**
 * withdraw 提出
 * @param token_address 
 * @param amount 
 * @param callback 
 */
export function withdraw(token_address: string, amount: string, callback: (code: number, hash: string) => void) {
  let mulBankContract = new web3.eth.Contract(MULBANK, ContractAddress[userInfo.chainID].mulBank);
  let bigAmount = convertNormalToBigNumber(amount, 18);
  executeContract(mulBankContract, "withdraw", 0, [token_address, bigAmount], callback);
}
/**
 * 收取et
 * @param type 
 * @param callback 
 */
//  export function harvestET(type: string, callback: (code: number, hash: string) => void) {
//   if (type == "ETHST") {
//     let pledgeMiningContract = new web3.eth.Contract(PLEDGEMINING, ContractAddress[userInfo.chainID].pledgeMining);
//     executeContract(pledgeMiningContract, "withdraw_ET", 0, [], callback);
//   } else if (type === "ETHSTUSDT") {
//     let lpMiningContract = new web3.eth.Contract(LPMINING, ContractAddress[userInfo.chainID].lpMining);
//     executeContract(lpMiningContract, "withdrawIncome", 0, ["0"], callback);
//   } else {
//     let lpMiningContract = new web3.eth.Contract(LPMINING, ContractAddress[userInfo.chainID].lpMining);
//     executeContract(lpMiningContract, "withdrawIncome", 0, ["1"], callback);
//   }
// }
/**
 * 质押ETHST
 * @param type 
 * @param amount 
 * @param callback 
 */
// export function stake(type: string, amount: string, callback: (code: number, hash: string) => void) {
//   let bigAmount = convertNormalToBigNumber(amount, 18);
//   if (type === "ETHST") {
//     let pledgeMiningContract = new web3.eth.Contract(PLEDGEMINING, ContractAddress[userInfo.chainID].pledgeMining);
//     executeContract(pledgeMiningContract, "stakeEthSt", 0, [bigAmount], callback);
//   } else if (type === "ETHSTUSDT") {
//     let lpMiningContract = new web3.eth.Contract(LPMINING, ContractAddress[userInfo.chainID].lpMining);
//     executeContract(lpMiningContract, "stackLp", 0, ['0', bigAmount], callback);
//   } else {
//     let lpMiningContract = new web3.eth.Contract(LPMINING, ContractAddress[userInfo.chainID].lpMining);
//     executeContract(lpMiningContract, "stackLp", 0, ['1', bigAmount], callback);
//   }
// }
/**
 * test
 * @param callback 
 */
export async function test(callback: (code: number, hash: string) => void) {
  let tokenContract = new web3.eth.Contract(ERC20, "0xae9269f27437f0fcbc232d39ec814844a51d6b8f");
  let bigAmount = convertNormalToBigNumber("500000000000", await getDecimal("0xae9269f27437f0fcbc232d39ec814844a51d6b8f"));
  executeContract(tokenContract, "approve", 0, ["0xA94507E3bd5e3Cd414b37456ba716A92F4877d6e", bigAmount], callback);
}

//----------------------------------------服务器信息-----------------------------------------------------------
/**
 * 拿全网算力
 * @returns 
 */
export async function networkHashrateInfo() {
  return fetch("https://api.ethst.io/api/v1/pool/v1/currency/stats?currency=ETH", { method: "get" }
  ).then((response) => {
    return response.json();
  });
}
/**
 * 拿贡献榜单
 * @returns 
 */
export function getRankList() {
  return rankList;
}
/**
 * 拿贡献榜单预先
 * @returns 
 */
export async function getRankListBefore() {
  const query = `
    {
        nodeMiningStakes(orderBy: amount, orderDirection: desc, first: 20) {
          id
          amount
        }
      }
    `;
  return fetch("https://api.ethst.io/subgraphs/name/ethst/ethst_project", {
    method: "post",
    headers: {
      "Content-type": "application/json",
    },
    body: JSON.stringify({ query, }),
  }).then((response) => response.json())
    .then((data) => {
      const nodeMiningStakes = data.data.nodeMiningStakes;
      rankList = {
        data: nodeMiningStakes.map((item: any) => {
          return {
            ...item,
            amount: convertBigNumberToNormal(item.amount, 18),
          };
        }),
      };
    })
    .catch(() => {
      rankList = { data: [] };
    });
}