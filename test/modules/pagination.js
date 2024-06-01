// @ts-check
import { ButtonPaginationBuilder, SendAs } from '@thenorthsolution/djs-pagination';
import { EmbedBuilder } from 'discord.js';
import { SlashCommandBuilder } from "reciple";

export class Pagination {
    /**
     * @type {import("reciple").AnyCommandResolvable[]}
     */
    commands = [
        new SlashCommandBuilder()
            .setName('pagination')
            .setDescription('Creates a pagination')
            .setExecute(async ({ interaction }) => {
                const pagination = new ButtonPaginationBuilder();

                pagination.setPages(
                    { content: 'Content', embeds: [{ title: 'Embed' }] },
                    'Just Content',
                    new EmbedBuilder().setTitle('Just Embed'),
                    () => `Dynamic ${new Date().toISOString()}`
                )

                await pagination.send({
                    command: interaction,
                    sendAs: SendAs.ReplyMessage
                })
            })
    ];

    onStart() {
        return true;
    }
}

export default new Pagination();