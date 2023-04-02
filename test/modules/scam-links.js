// @ts-check
import { DiscordScamLinks } from '@falloutstudios/djs-scam-links';
import { codeBlock } from 'discord.js';

/**
 * @type {import('reciple').RecipleModuleScript & { links: DiscordScamLinks }}
 */
export default {
    versions: ['^7'],
    links: new DiscordScamLinks(),

    async onStart(client) {
        return true;
    },

    async onLoad(client) {
        client.on('messageCreate', async message => {
            if (message.author.bot || message.author.system || !message.content) return;

            const detected = this.links.getMatches(message.content);
            if (!detected.length) return;


            await message.delete();
            await message.channel.send(`${message.author} Your message contains suspicious link(s):\n${codeBlock(detected.join('\n'))}`);
        })
    }
};