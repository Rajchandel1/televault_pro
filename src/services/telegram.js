const { Bot, InputFile } = require('grammy');
const { Api }            = require('grammy/types'); // optional
const { BOT_TOKEN }      = require('../config/env');

const bot = new Bot(BOT_TOKEN);

const buildFileUrl = (filePath) =>
    `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

module.exports = { bot, InputFile, buildFileUrl };