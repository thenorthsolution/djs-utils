// @ts-check
import { ButtonPaginationBuilder } from "@falloutstudios/djs-pagination";
import { ButtonStyle, ComponentType, EmbedBuilder } from "discord.js";
import { CommandType } from "reciple";

/**
 * @type {import("reciple").RecipleModuleData}
 */
export default {
    versions: ['^8'],
    commands: [
        {
            command_type: CommandType.SlashCommand,
            name: 'meme',
            description: 'Some random memes from the internet',
            execute: async ({ interaction }) => {
                const pagination = new ButtonPaginationBuilder({
                    pages: [
                        async () => {
                            const request = await fetch('https://meme-api.com/gimme');
                            const data = await request.json();
                            const embed = new EmbedBuilder();

                            if (request.status !== 200 || !request.ok) return embed.setAuthor({ name: `An error occured` }).setColor('Red');

                            return embed
                                .setAuthor({ name: `r/${data.subreddit}`, url: data.postLink })
                                .setTitle(data.title)
                                .setURL(data.postLink)
                                .setImage(data.url)
                                .setFooter({ text: `🔼 ${data.ups} ┃ u/${data.author}` });
                        }
                    ],
                    buttons: [
                        {
                            button: { type: ComponentType.Button, label: 'Refresh', customId: 'refresh', style: ButtonStyle.Primary },
                            type: 'NextPage'
                        },
                        {
                            button: { type: ComponentType.Button, label: 'Stop', customId: 'stop', style: ButtonStyle.Secondary },
                            type: 'Stop'
                        }
                    ],
                    endTimer: 1000 * 30,
                    onEnd: 'DisableComponents',
                    singlePageNoControllers: false
                });

                await interaction.deferReply();

                await pagination.send({
                    command: interaction,
                    sendAs: 'EditMessage'
                });
            }
        }
    ],
    onStart: () => true
};