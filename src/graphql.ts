import { getTokenSymbol, collect } from "./index";
import { userInfo, ContractAddress } from "./lib_config";
import { add, convertBigNumberToNormal } from "./lib.utils";

import { getV3LP } from "./api2";
import { Price, Token } from "@uniswap/sdk-core";
import { tickToPrice, priceToClosestTick } from "@uniswap/v3-sdk";

export function getprice(token0_address: string, token1_address: string, tick: number) {
  let token0 = new Token(1, token0_address, 6);//usdt
  let token1 = new Token(1, token1_address, 18);//eth
  let price0 = tickToPrice(token0, token1, tick).toFixed(4);
  let price1 = tickToPrice(token1, token0, tick).toFixed(4);
  // console.log("--------", priceToClosestTick(new Price(token0, token1, 2643.5847 * 1e6, 1e18)));
  return {
    data: {
      price0: price0,
      price1: price1,
    }
  }
}
var tokenList: [];

let graphql = "https://api.thegraph.com/subgraphs/name/winless/multiple";// https://graph.multiple.fi/

/**
 * 拿投资列表
 * @returns
 */
export async function getinvestList() {
  const query = `
      {
        positions(where:{user:"${userInfo.account}"}) {
          id
          user
          positionId
          token0
          token1
          debt0
          debt1
          exit0
          exit1
          liquidity
          tickLower
          tickUpper
          close
          }
        }
      `;
  return fetch(graphql, {
    method: "post",
    headers: {
      "Content-type": "application/json",
    },
    body: JSON.stringify({ query }),
  }).then((response) => response.json())
    .then((data) => {
      let history = data.data.positions;
      return {
        data: history.map((item: any) => {
          return {
            ...item,
            debt0: convertBigNumberToNormal(item.debt0, 18),
            debt1: convertBigNumberToNormal(item.debt1, 18),
            priceLower: Math.pow(1.0001, item.tickLower),
            priceUpper: Math.pow(1.0001, item.tickUpper),
            symbol0: getTokenSymbol(item.token0),
            symbol1: getTokenSymbol(item.token1),
          };
        }),
      };
    })
    .catch(() => {
      return { data: [] };
    });
}
/**
 * 获取池子信息
 * @returns 
 */
export async function getPositionInfo(poolAddress: string) {
  let res = await getV3LP();
  let res2 = await getPositionInfo2(poolAddress)
  return {
    data: {
      ticks: res,
      poolInfo: res2.poolInfo,
      ethPriceUSD: res2.ethPriceUSD,
    }
  }
}
/**
 * 填写pool地址
 * @param poolAddress 
 * @returns 
 */
export async function getPositionInfo2(poolAddress: string) {
  const query = `
    {
        bundles {
          ethPriceUSD
        }
        pool(id: "${poolAddress}") {
            id
            feeTier
            liquidity
            sqrtPrice
            tick
            token0 {
              id
              symbol
              name
              decimals
              derivedETH
            }
            token1 {
              id
              symbol
              name
              decimals
              derivedETH
            }
            token0Price
            token1Price
            volumeUSD
            txCount
            totalValueLockedToken0
            totalValueLockedToken1
            totalValueLockedUSD
        }
      }
      `;
  return fetch(ContractAddress[userInfo.chainID].v3gql, {
    method: "post",
    headers: {
      "Content-type": "application/json",
    },
    body: JSON.stringify({ query }),
  }).then((response) => response.json())
    .then((data) => {
      let ethPriceUSD = data.data.bundles[0].ethPriceUSD;
      let poolInfo = data.data.pool;
      return {
        poolInfo: poolInfo,
        ethPriceUSD: ethPriceUSD,
      }
    })
}
export async function getSingleStrategy(sid: string) {
  let res = await getPoolPrice();
  const query = `
  {
    strategyEntities(where: {sid:"${sid}",user: "${userInfo.account}",end:false}) {
      sid
      end
      pool
      token0 {
        symbol
        id
        decimals
      }
      token1 {
        symbol
        id
        decimals
      }
      accFee0
      accFee1
      accInvest0
      accInvest1
      preInvest0
      preInvest1
      createdAtTimestamp
      currTickLower
      currTickUpper
      currLiquidity
    }
  }
    `;
  return fetch(ContractAddress[userInfo.chainID].strateggql, {
    method: "post",
    headers: {
      "Content-type": "application/json",
    },
    body: JSON.stringify({ query }),
  }).then((response) => response.json())
    .then(async (data) => {
      if (data.data.strategyEntities.length > 0) {
        let strategyEntitie = data.data.strategyEntities[0];
        let currPriceLower = calculatePrice(strategyEntitie.currTickLower);
        let currPriceUpper = calculatePrice(strategyEntitie.currTickUpper);
        if (currPriceLower > currPriceUpper) {
          [currPriceLower, currPriceUpper] = [currPriceUpper, currPriceLower]
        }
        let token0token1Info = calculatetoken0token1(strategyEntitie.currTickLower, res.tick, strategyEntitie.currTickUpper, strategyEntitie.currLiquidity, res.sqrtPrice, res.token0Price);
        let result = await collect(strategyEntitie.sid);
        let fee0 = (+result.data.fee0 + +strategyEntitie.accFee0).toFixed(8);
        let fee1 = (+result.data.fee1 + +strategyEntitie.accFee1).toFixed(8);
        let poolHourPriceres = await getPoolHourPrices(strategyEntitie.pool, strategyEntitie.createdAtTimestamp);
        let outrangetime = Math.floor(Date.now() / 1000).toFixed();
        if (res.tick < strategyEntitie.currTickLower) {//下超出
          for (let j = poolHourPriceres.poolHourDatas.length - 1; j >= 0; j--) {
            if (poolHourPriceres.poolHourDatas[j].tick < strategyEntitie.currTickLower) {
              outrangetime = poolHourPriceres.poolHourDatas[j].timestamp;
            } else {
              break;
            }
          }
        } else if (res.tick > strategyEntitie.currTickUpper) {//上超出
          for (let j = poolHourPriceres.poolHourDatas.length - 1; j >= 0; j--) {
            if (poolHourPriceres.poolHourDatas[j].tick > strategyEntitie.currTickUpper) {
              outrangetime = poolHourPriceres.poolHourDatas[j].timestamp;
            } else {
              break;
            }
          }
        }
        return {
          data: {
            ...strategyEntitie,
            ...token0token1Info,
            currPriceLower: currPriceLower,
            currPriceUpper: currPriceUpper,
            token0Price: res.token0Price,
            token1Price: res.token1Price,
            sqrtPrice: res.sqrtPrice,
            tick: res.tick,
            outrangetime: outrangetime,
            fee0: fee0,
            fee1: fee1,
            collectFee0: result.data.fee0,
            collectFee1: result.data.fee1,
            accumulativedee: (+fee0 + +fee1 * +res.token0Price).toFixed(8),
          }
        }
      } else {
        return { data: {} };
      }
    })
}
/**
 * 获取strategy
 * @returns 
 */
export async function strategyEntities(account: string) {
  account = account.toLowerCase();
  let res = await getPoolPrice();
  const query = `
  {
    strategyEntities(where: {user: "${account}",end:false}) {
      sid
      end
      pool
      token0 {
        symbol
        id
        decimals
      }
      token1 {
        symbol
        id
        decimals
      }
      accFee0
      accFee1
      accInvest0
      accInvest1
      preInvest0
      preInvest1
      createdAtTimestamp
      currTickLower
      currTickUpper
      currLiquidity
    }
  }
    `;
  return fetch(ContractAddress[userInfo.chainID].strateggql, {
    method: "post",
    headers: {
      "Content-type": "application/json",
    },
    body: JSON.stringify({ query }),
  }).then((response) => response.json())
    .then((data) => {
      let strategyEntities = data.data.strategyEntities;
      return strategyEntities.map((item: any) => {
        let currPriceLower = calculatePrice(item.currTickLower);
        let currPriceUpper = calculatePrice(item.currTickUpper);
        if (currPriceLower > currPriceUpper) {
          [currPriceLower, currPriceUpper] = [currPriceUpper, currPriceLower]
        }
        let token0token1Info = calculatetoken0token1(item.currTickLower, res.tick, item.currTickUpper, item.currLiquidity, res.sqrtPrice, res.token0Price);
        return {
          ...item,
          ...token0token1Info,
          currPriceLower: currPriceLower,
          currPriceUpper: currPriceUpper,
          token0Price: res.token0Price,
          token1Price: res.token1Price,
          sqrtPrice: res.sqrtPrice,
          tick: res.tick,
          accumulativedee: +item.accFee0 + +item.accFee1 * +res.token0Price,
        }
      })
    }).then(async data => {
      data.sort((a: any, b: any) => { return a.sid - b.sid });
      for (var i = 0; i < data.length; i++) {
        if (data[i].end) {
          data.splice(i, 1);
          i -= 1;
        }
      }
      const sids = data.map((item: any) => item.sid)
      //@ts-ignore
      await sids.reduce(async (pre, sid, i) => {
        await pre
        let result = {
          data: {
            fee0: "0",
            fee1: "0",
          }
        };
        if (account === userInfo.account) {
          result = await collect(sid);
        } else {
          result.data.fee0 = "0";
          result.data.fee1 = "0";
        }
        data[i]["fee0"] = result.data.fee0;
        data[i]["fee1"] = result.data.fee1;
        data[i]["collectFee0"] = result.data.fee0;
        data[i]["collectFee1"] = result.data.fee1;

        data[i]["fee0"] = +data[i]["accFee0"] + +data[i]["fee0"]
        data[i]["fee1"] = +data[i]["accFee1"] + +data[i]["fee1"]
        data[i]["fee0"] = data[i]["fee0"].toFixed(8)
        data[i]["fee1"] = data[i]["fee1"].toFixed(8)
        data[i]["accumulativedee"] = +  data[i]["fee0"] + + data[i]["fee1"] * +data[i].token0Price;
        data[i]["accumulativedee"] = data[i]["accumulativedee"].toFixed(8);
        let poolHourPriceres = await getPoolHourPrices(data[i].pool, data[i].createdAtTimestamp);
        let outrangetime = Math.floor(Date.now() / 1000).toFixed();
        if (data[i].tick < data[i].currTickLower) {//下超出
          for (let j = poolHourPriceres.poolHourDatas.length - 1; j >= 0; j--) {
            if (poolHourPriceres.poolHourDatas[j].tick < data[i].currTickLower) {
              outrangetime = poolHourPriceres.poolHourDatas[j].timestamp;
            } else {
              break;
            }
          }
        } else if (data[i].tick > data[i].currTickUpper) {//上超出
          for (let j = poolHourPriceres.poolHourDatas.length - 1; j >= 0; j--) {
            if (poolHourPriceres.poolHourDatas[j].tick > data[i].currTickUpper) {
              outrangetime = poolHourPriceres.poolHourDatas[j].timestamp;
            } else {
              break;
            }
          }
        }
        data[i]["outrangetime"] = outrangetime;
      }, Promise.resolve())
      return data
    })
}
function calculatePrice(tick: number) {
  return 1 / Math.pow(1.0001, tick) * 1e12;
}
export function calculatetoken0token1(tickLower: number, tickCurrent: number, tickUpper: number, lp: number, sqrtPrice: number, token0Price: number) {
  let a = Math.sqrt(Math.pow(1.0001, tickLower));
  let b = sqrtPrice / Math.pow(2, 96);
  let c = Math.sqrt(Math.pow(1.0001, tickUpper));
  let token0amount = 0;
  let token1amount = 0;
  if (b <= a) {
    token0amount = lp * (c - a) / (c * a) / 1e6;
    token1amount = 0;
  } else if (c <= b) {
    token0amount = 0;
    token1amount = lp * (c - a) / 1e18;
  } else {
    token0amount = lp * (c - b) / (c * b) / 1e6;
    token1amount = lp * (b - a) / 1e18;
  }
  return {
    token0amount: token0amount,
    token1amount: token1amount,
    totalvalue: token0amount + token1amount * token0Price,
    token0Ratio: token0amount / (token0amount + token1amount * token0Price),
    token1Ratio: 1 - token0amount / (token0amount + token1amount * token0Price),
    sumLiquidity: token0amount + token1amount * token0Price,
  }
}
/**
 * token列表
 * @returns 
 */
export async function getTokenList() {
  const query = `
    {
        tokens {
          id
          symbol
          decimals
        }
    }
    `;
  return fetch(ContractAddress[userInfo.chainID].v3gql, {
    method: "post",
    headers: {
      "Content-type": "application/json",
    },
    body: JSON.stringify({ query }),
  }).then((response) => response.json())
    .then((data) => {
      tokenList = data.data.tokens;
      return tokenList
    })
    .catch(() => {
      tokenList = [];
    });
}
/**
 * 
 * @returns 
 */
export async function getPoolPrice() {
  const query = `
  {
    pools(where: {id: "0xe7f7eebc62f0ab73e63a308702a9d0b931a2870e"}) {
      token0Price
      token1Price
      sqrtPrice
      tick
    }
  }
    `;
  return fetch(ContractAddress[userInfo.chainID].v3gql, {
    method: "post",
    headers: {
      "Content-type": "application/json",
    },
    body: JSON.stringify({ query }),
  }).then((response) => response.json())
    .then((data) => {
      let pools = data.data.pools[0];
      return pools
    })
}
/**
 * 获取池子的tvl 24h
 * @returns 
 */
export async function getDayTvl() {
  const query = `
  {
    poolDayDatas(orderBy: date, orderDirection: desc, first: 1) {
      pool {
        id
        token0 {
          symbol
          id
        }
        token1 {
          symbol
          id
        }
      }
      date
      tvlUSD
      volumeUSD
    }
  }
    `;
  return fetch(ContractAddress[userInfo.chainID].v3gql, {
    method: "post",
    headers: {
      "Content-type": "application/json",
    },
    body: JSON.stringify({ query }),
  }).then((response) => response.json())
    .then((data) => {
      let day0 = data.data.poolDayDatas[0];
      return {
        data: {
          tvlUSD: +day0.tvlUSD,
          volumeUSD: +day0.volumeUSD,
        }
      }
    })
}
/**
 * 风险图表
 * @param sid 
 * @returns 
 */
export async function riskManagement(sid: string) {
  const query = `
  {
    switchEntities(orderBy: timestamp,where: {sid: "${sid}"}) {
      position {
        tick {
          sqrtPriceX96
        }
      }
      amount0
      amount1
      exit0
      exit1
      hedge
      accInvest0
      accInvest1
      timestamp
    }
  }
    `;
  return fetch(ContractAddress[userInfo.chainID].strateggql, {
    method: "post",
    headers: {
      "Content-type": "application/json",
    },
    body: JSON.stringify({ query }),
  }).then((response) => response.json())
    .then((data) => {
      let hedgeAmount0 = 0;
      let hedgeAmount1 = 0;
      let switchEntities = data.data.switchEntities.map((item: any) => {
        if (item.hedge) {
          hedgeAmount0 = hedgeAmount0 + (item.amount0 - item.exit0);
          hedgeAmount1 = hedgeAmount1 + (item.amount1 - item.exit1);
        }
        return {
          ...item,
          price: (1 / Math.pow(+item.position.tick.sqrtPriceX96 / (Math.pow(2, 96)), 2) * 1e12).toFixed(6),
          hedgeAmount0: hedgeAmount0,
          hedgeAmount1: hedgeAmount1,
        }
      });
      let lastHedgeAmount0 = switchEntities.length > 0 ? switchEntities[switchEntities.length - 1].hedgeAmount0 : 0;
      let lastHedgeAmount1 = switchEntities.length > 0 ? switchEntities[switchEntities.length - 1].hedgeAmount1 : 0;
      return {
        data: {
          lastHedgeAmount0: lastHedgeAmount0,
          lastHedgeAmount1: lastHedgeAmount1,
          switchEntities,
        }
      }
    })
}
/**
 * 拿performance图表数据
 * @param sid 
 * @returns 
 */
export async function performance(sid: string) {
  const query = `
  {
    strategyEntities(where: {sid: "${sid}"}) {
      accFee0
      accFee1
    }
    position2Strategy(id: "${sid}") {
      timestamp
    }
    collectEntities(orderBy: timestamp, where: {sid: "${sid}"}) {
      timestamp
      accFee0
      accFee1
    }
  }
    `;
  return fetch(ContractAddress[userInfo.chainID].strateggql, {
    method: "post",
    headers: {
      "Content-type": "application/json",
    },
    body: JSON.stringify({ query }),
  }).then((response) => response.json())
    .then((data) => {
      let collectEntities = data.data.collectEntities;
      return {
        data: {
          creattimestamp: data.data.position2Strategy.timestamp,
          collectEntities
        }
      }
    })
}
/**
 * 池子价格变化
 * @returns 
 */
export async function getPoolHourPrices(poolAddress: string, timestame: string) {
  const query = `
  {
    poolHourDatas(orderBy: timestamp, first: 1000, where: {timestamp_gt: "${timestame}", pool: "${poolAddress}"}) {
      timestamp
      token0Price
      tick
    }
  }
    `;
  return fetch(ContractAddress[userInfo.chainID].v3gql, {
    method: "post",
    headers: {
      "Content-type": "application/json",
    },
    body: JSON.stringify({ query }),
  }).then((response) => response.json())
    .then((data) => {
      let poolHourDatas = data.data.poolHourDatas;
      return {
        poolHourDatas
      }
    })
}
/**
 * 建仓时间
 * @param sid 
 * @returns 
 */
export async function getCreatStrategyinfo(sid: string) {
  const query = `
  {
    strategyEntities(where: {sid: "${sid}"}) {
      position {
        tick {
          timestamp
          tickLower
          tickUpper
        }
      }
      switching (orderBy:timestamp,first:500){
        position {
          tick {
            timestamp
            tickLower
            tickUpper
          }
        }
      }
    }
  }
    `;
  return fetch(ContractAddress[userInfo.chainID].strateggql, {
    method: "post",
    headers: {
      "Content-type": "application/json",
    },
    body: JSON.stringify({ query }),
  }).then((response) => response.json())
    .then((data) => {
      let priceLower = calculatePrice(+data.data.strategyEntities[0].position.tick.tickLower);
      let priceUpper = calculatePrice(+data.data.strategyEntities[0].position.tick.tickUpper);
      if (priceLower > priceUpper) {
        [priceLower, priceUpper] = [priceUpper, priceLower];
      }
      let firstPosition = {
        priceLower: priceLower,
        priceUpper: priceUpper,
        timestamp: data.data.strategyEntities[0].position.tick.timestamp,
      }
      let switchingdetail = data.data.strategyEntities[0].switching.map((item: any) => {
        let priceLower = calculatePrice(+item.position.tick.tickLower);
        let priceUpper = calculatePrice(+item.position.tick.tickUpper);
        if (priceLower > priceUpper) {
          [priceLower, priceUpper] = [priceUpper, priceLower];
        }
        return {
          priceLower: priceLower,
          priceUpper: priceUpper,
          timestamp: item.position.tick.timestamp,
        }
      })
      switchingdetail.unshift(firstPosition);
      return {
        switchingdetail
      }
    })
}
/**
 * 分析report图表数据
 * @param sid 
 */
export async function report(poolAddress: string, sid: string) {
  let res1 = await getCreatStrategyinfo(sid);
  let firstTimestemp = res1.switchingdetail[0].timestamp;
  let timestame = (Number(firstTimestemp) - 1800).toString();
  let res2 = await getPoolHourPrices(poolAddress, timestame);
  let totalswitchcount = res1.switchingdetail.length - 1;
  let day24hswitchcount = 0;
  let day24htimestamp = Math.floor(Date.now() / 1000) - 86400;
  for (let i = res1.switchingdetail.length - 1; i > 0; i--) {
    if (+res1.switchingdetail[i].timestamp > day24htimestamp) {
      day24hswitchcount++;
    } else {
      break;
    }
  }
  let resultList: any = [];
  res1.switchingdetail.forEach((item: any) => {
    resultList.push({
      type: "L",
      price: +Number(item.priceLower).toFixed(6),
      timestamp: +item.timestamp,
    })
    resultList.push({
      type: "U",
      price: +Number(item.priceUpper).toFixed(6),
      timestamp: +item.timestamp,
    })
  });
  res2.poolHourDatas.forEach((item: any) => {
    resultList.push({
      type: "C",
      price: +Number(item.token0Price).toFixed(6),
      timestamp: +item.timestamp,
    })
  });

  return {
    data: {
      day24hswitchcount: day24hswitchcount,
      totalswitchcount: totalswitchcount,
      result: resultList.sort((a: any, b: any) => a.type > b.type ? -1 : 1)
    }
  }
}
/**
 * 获取排行榜
 * @returns 
 */
export async function getGPRankList() {
  const query = `
  {
    ranks(paging:{orderBy:"feeValue",order:desc}){
      user
      value
      feeValue
      yearProfit
      yearProfit2
      profit
      updateTime
    }
    rank(user:"${userInfo.account}"){
      user
      value
      yearProfit
      yearProfit2
      feeValue
      profit
      updateTime
    }
  }
    `;
  return fetch(ContractAddress[userInfo.chainID].rankgql, {
    method: "post",
    headers: {
      "Content-type": "application/json",
    },
    body: JSON.stringify({ query }),
  }).then((response) => response.json())
    .then((data) => {
      let ranklist = data.data.ranks;
      let selfinfo = data.data.rank;
      let selfIndex = ranklist.indexOf(ranklist.filter((item: any) => item.user == userInfo.account)[0]);
      return {
        data: {
          selfIndex: 1 + +selfIndex,
          ranklist: ranklist,
          selfinfo: selfinfo,
        }
      }
    })
}
/**
 * 水龙头
 * @returns 
 */
export async function faucet(address: string) {
  const query = `
  mutation{
    faucet(user: "${address}") {
      tx
      amount
      sendTime
      user
    }
  }
    `;
  return fetch(ContractAddress[userInfo.chainID].rankgql, {
    method: "post",
    headers: {
      "Content-type": "application/json",
    },
    body: JSON.stringify({ query }),
  }).then((response) => response.json())
    .then((data) => {
      let faucet = data.data.faucet;
      return {
        data: {
          faucet
        }
      }
    })
}
/**
 * 检查水龙头
 * @returns 
 */
export async function checkFaucet(address: string) {
  const query = `
  {
    faucet(user: "${address}") {
      tx
      amount
      sendTime
      user
    }
  }
    `;
  return fetch(ContractAddress[userInfo.chainID].rankgql, {
    method: "post",
    headers: {
      "Content-type": "application/json",
    },
    body: JSON.stringify({ query }),
  }).then((response) => response.json())
    .then((data) => {
      let faucet = data.data.faucet;
      return {
        data: {
          faucet
        }
      }
    })
}
/**
 * 波动率
 * @param start_date 开始时间
 * @param end_date 截止时间
 * @param type 
 * @returns 
 */
export async function getVolatility(start_date: number, end_date: number, type: "daily_1" | "weekly_2") {
  start_date = start_date <= 1623974400 ? 1623974400 : start_date;
  let poolDayDatas = {};
  if (type === "daily_1") {
    poolDayDatas = await getdateDayDates(start_date);
  }
  const query = `
  {
    volatility(start_date: ${start_date}, end_date: ${end_date}, tp:${type}) {
      date
      value
    }
  }
    `;
  return fetch(ContractAddress[userInfo.chainID].rankgql, {
    method: "post",
    headers: {
      "Content-type": "application/json",
    },
    body: JSON.stringify({ query }),
  }).then((response) => response.json())
    .then((data) => {
      let volatility = data.data.volatility;
      return {
        data: {
          volatility: volatility,
          poolDayDatas: poolDayDatas
        }
      }
    })
}
/**
 * 获取每日价格
 * @param startTime 
 * @returns 
 */
export async function getdateDayDates(startTime: number) {
  const query = `
  {
    poolDayDatas(orderBy: date, orderDirection: desc, where: {date_gt: ${startTime}, pool: "0xe7f7eebc62f0ab73e63a308702a9d0b931a2870e"}) {
      token0Price
      token1Price
      sqrtPrice
      date
    }
  }
  `
  return fetch(ContractAddress[userInfo.chainID].v3gql, {
    method: "post",
    headers: {
      "Content-type": "application/json",
    },
    body: JSON.stringify({ query }),
  }).then((response) => response.json())
    .then((data) => {
      let ethDayPrice = data.data.poolDayDatas;
      return {
        poolDayDatas: ethDayPrice
      }
    })
}