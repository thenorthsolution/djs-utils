# @thenorthsolution/djs-pagination
![npm bundle size (scoped)](https://img.shields.io/bundlephobia/min/@thenorthsolution/djs-pagination?style=flat-square)
![GitHub](https://img.shields.io/github/license/FalloutStudios/djs-pagination?style=flat-square)
![npm (scoped)](https://img.shields.io/npm/v/@thenorthsolution/djs-pagination?label=Latest%20Version&style=flat-square)

A simple button and reaction pagination library for Discord.js v14

## Installation

```bash
npm i @thenorthsolution/djs-pagination discord.js
```

### Features
- Object Oriented
- Easy to use
- Uses Message data as pages instead of embeds
  - Supports dynamic pages
  - Allows pages with just message content
  - Supports multiple embeds in one page
  - Custom page action rows
- Supports interaction followUps
- Highly customizable
- Typescript support

## Getting Started

> You can use this in TypeScript, ESM, or CommonJS but in these examples we're gonna use CommonJS.

### Button Pagination

```js
import { ButtonPaginationBuilder } from '@thenorthsolution/djs-pagination';
import { ButtonBuilder, Client, EmbedBuilder } from 'discord.js';

const bot = new Client({
    intents: ['Guilds', 'MessageContent']
});

bot.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName == 'pagination') {
        // Create pagination
        const pagination = new ButtonPaginationBuilder()
            // Add at least one page
            .addPages(
                new EmbedBuilder().setDescription('Page 1'), // Single embed page
                { content: 'Page 2', embeds: [{ title: 'Page 2' }] }, // Message data embed
                'Page 3', // String page
                () => new EmbedBuilder().setDescription('Page 4\n' + new Date().toString()) // Dynamic page
            )
            // All buttons are optional
            .addButton(new ButtonBuilder().setLabel('First').setCustomId('first'), 'FirstPage')
            .addButton(new ButtonBuilder().setLabel('Previous').setCustomId('prev'), 'PreviousPage')
            .addButton(new ButtonBuilder().setLabel('Stop').setCustomId('stop'), 'Stop')
            .addButton(new ButtonBuilder().setLabel('Next').setCustomId('next'), 'NextPage')
            .addButton(new ButtonBuilder().setLabel('Last').setCustomId('last'), 'LastPage');

        // Listens to pagination errors
        pagination.on('error', console.log);

        // Sends the pagination message
        await pagination.send({ command: interaction, sendAs: 'ReplyMessage' });
    }
});

bot.login('TOKEN');
```

### Reaction Pagination
> ⚠️ You cannot use reaction pagination with ephemeral messages

```js
import { ReactionPaginationBuilder } from '@thenorthsolution/djs-pagination';
import { Client, EmbedBuilder } from 'discord.js';

const bot = new Client({
    intents: ['Guilds', 'MessageContent', 'GuildMessageReactions']
});

bot.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand() && interaction.commandName == 'pagination') {
        // Create pagination
        const pagination = new ReactionPaginationBuilder()
                // Add at least one page
            .addPages(
                new EmbedBuilder().setDescription('Page 1'), // Single embed page
                { content: 'Page 2', embeds: [{ title: 'Page 2' }] }, // Message data embed
                'Page 3', // String page
                () => new EmbedBuilder().setDescription('Page 4\n' + new Date().toString()) // Dynamic page
            )
            // All reaction controllers are optional
            .addReaction('⏪', 'FirstPage');
            .addReaction('⬅', 'PreviousPage');
            .addReaction('🛑', 'Stop');
            .addReaction('➡️', 'NextPage');
            .addReaction('⏩', 'LastPage');

        // Listens to pagination errors
        pagination.on('error', console.log);

        // Sends the pagination message
        await pagination.send({ command: interaction, sendAs: 'ReplyMessage' });
    }
});

bot.login('TOKEN');
```