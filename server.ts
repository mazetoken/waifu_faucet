import * as dotenv from "dotenv";
dotenv.config();

import * as express from "express";
const rateLimit = require("express-rate-limit");
const { verify } = require('hcaptcha');
const app = express();

app.set('trust proxy', 1);

const apiLimiter = rateLimit({
  windowMs: 4 * 60 * 60 * 1000, // 4 hours
  max: 1,
  draft_polli_ratelimit_headers: true,
});

import BigNumber from "bignumber.js";
import * as bodyParser from "body-parser";
import * as slpjs from "slpjs";
import { SlpFaucetHandler } from "./slpfaucet";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const slpFaucet = new SlpFaucetHandler(process.env.MNEMONIC!);
const faucetQty = parseInt(process.env.TOKENQTY!);

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));
app.set("view engine", "ejs");

app.get("/", (req, res) => {
	res.render("index", { txid: null, error: null });
});

app.post("/", apiLimiter, async (req, res) => {
    const address = req.body.address;

    if (address === process.env.DISTRIBUTE_SECRET!) {

        try {
            await slpFaucet.evenlyDistributeTokens(process.env.TOKENID!);
        } catch (err) {
            console.log(err);
            res.render("index", { txid: null, error: err.message });
            return;
        }
        
        try {
            await slpFaucet.evenlyDistributeBch();
        } catch (err) {
            console.log(err);
            res.render("index", { txid: null, error: err.message });
            return;
        }
        slpFaucet.currentFaucetAddressIndex = 0;
        res.render("index", { txid: null, error: "Token distribution instantiated..." });
        return;
    }

    try {
        if (!slpjs.Utils.isSlpAddress(address)) {
            res.render("index", { txid: null, error: "Not a SLP Address." });
            return;
        }
    } catch (error) {
        res.render("index", { txid: null, error: "Not a SLP Address." });
        return;
    }

    console.log(req.body);

    try {
        const verifyData = await verify(process.env.HCAPTCHA_SECRET, req.body["h-captcha-response"])
        console.log(verifyData);
        if (! verifyData.success) {
            throw new Error('captcha verification failed');
        }
    } catch (e) {
        res.render("index", { txid: null, error: e.message });
        return;
    }
    
    let changeAddr: { address: string, balance: slpjs.SlpBalancesResult };
    try {
        changeAddr = await slpFaucet.selectFaucetAddressForTokens(process.env.TOKENID!);
    } catch (error) {
        res.render("index", { txid: null, error: "No zombies detected. Try to bite somebody or check again later" });
        return;
    }

    let sendTxId: string;
    try {
        let inputs: slpjs.SlpAddressUtxoResult[] = [];
        inputs = inputs.concat(changeAddr.balance.slpTokenUtxos[process.env.TOKENID!]).concat(changeAddr.balance.nonSlpUtxos);
        inputs.map((i) => i.wif = slpFaucet.wifs[changeAddr.address]);
        sendTxId = await slpFaucet.tokenSend(process.env.TOKENID!, new BigNumber(faucetQty), inputs, address, changeAddr.address);
    } catch (error) {
        console.log(error);
        res.render("index", { txid: null, error: "Horde is not responding" });
        return;
    }
    console.log(sendTxId);
    const re = /^([A-Fa-f0-9]{2}){32,32}$/;
    if (typeof sendTxId !== "string" || !re.test(sendTxId)) {
        res.render("index", { txid: null, error: sendTxId });
        return;
    }

    res.render("index", { txid: sendTxId, error: null });
});

app.listen(process.env.PORT, () => {
    console.log("SLP faucet server listening on port " + process.env.PORT + "!");
});
