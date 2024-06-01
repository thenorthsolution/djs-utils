// @ts-check
import { DiscordScamLinks } from '@thenorthsolution/djs-scam-links';
import { inlineCode } from 'discord.js';

export class ScamLinks {
    manager = new DiscordScamLinks();

    async onStart() {
        await this.manager.refreshDomains();
        return true;
    }

    /**
     * @param {import('reciple').RecipleModuleLoadData} param0
     */
    async onLoad({ client }) {
        client.on('messageCreate', async message => {
            if (message.author.bot) return;

            const matches = this.manager.getMatches(message.content);
            if (!matches.length) return;

            await message.reply(`${message.author} Your message matched to a scam message! ${matches.map(l => inlineCode(l)).join(' ')}`);
            await message.delete();
        });
    }
}

export default new ScamLinks();