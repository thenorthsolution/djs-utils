# Djs Pagination
![npm bundle size (scoped)](https://img.shields.io/bundlephobia/min/@falloutstudios/djs-pagination?style=flat-square)
![GitHub](https://img.shields.io/github/license/FalloutStudios/djs-pagination?style=flat-square)
![npm (scoped)](https://img.shields.io/npm/v/@falloutstudios/djs-pagination?label=Latest%20Version&style=flat-square)

A simple button and reaction pagination library for Discord.js v14

## Installation

```bash
npm i @falloutstudios/djs-pagination discord.js
```

## Getting Started

> You can use this in TypeScript, ESM, or CommonJS but in these examples we're gonna use CommonJS.

### Button Pagination
> ⚠️ You cannot delete ephemeral pagination & you need to specify `authorId` when using `NewMessage` to `sendAs` param

```js
const { ButtonPaginationBuilder } = require('@falloutstudios/djs-pagination');
const { ButtonBuilder, Client, EmbedBuilder } = require('discord.js');

const bot = new Client({
    intents: ['Guilds', 'MessageContent']
});

bot.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName == 'pagination') {
        // Create pagination
        const pagination = new ButtonPaginationBuilder()
            // Add at least one page
            .addPages([
                new EmbedBuilder().setDescription('Page 1'), // Single embed page
                { content: 'Page 2', embeds: [] }, // Message data embed
                'Page 3', // String page
                () => new EmbedBuilder().setDescription(new Date().toString()) // Dynamic page
            ])
            // All buttons are optional
            .addButton(new ButtonBuilder().setLabel('Firat').setCustomId('first'), 'FirstPage')
            .addButton(new ButtonBuilder().setLabel('Previous').setCustomId('prev'), 'PreviousPage')
            .addButton(new ButtonBuilder().setLabel('Stop').setCustomId('stop'), 'Stop')
            .addButton(new ButtonBuilder().setLabel('Next').setCustomId('next'), 'NextPage')
            .addButton(new ButtonBuilder().setLabel('Last').setCustomId('last'), 'LastPage');

        await pagination.paginate(interaction, 'ReplyMessage');
    }
});

bot.login('TOKEN');
```

### Reaction Pagination
> ⚠️ You cannot use reaction pagination with ephemeral messages

```js
const { ReactionPaginationBuilder } = require('@falloutstudios/djs-pagination');
const { Client, EmbedBuilder } = require('discord.js');

const bot = new Client({
    intents: ['Guilds', 'MessageContent', 'GuildMessageReactions']
});

bot.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName == 'pagination') {
        // Create pagination
        const pagination = new ReactionPaginationBuilder()
            // Add at least one page
            .addPages([
                new EmbedBuilder().setDescription('Page 1'), // Single embed page
                { content: 'Page 2', embeds: [] }, // Message data embed
                'Page 3', // String page
                () => new EmbedBuilder().setDescription(new Date().toString()) // Dynamic page
            ])
            // All reaction controllers are optional
            .addReaction('⏪', 'FirstPage');
            .addReaction('⬅', 'PreviousPage');
            .addReaction('🛑', 'Stop');
            .addReaction('➡️', 'NextPage');
            .addReaction('⏩', 'LastPage');

        await pagination.paginate(interaction, 'ReplyMessage');
    }
});

bot.login('TOKEN');
```