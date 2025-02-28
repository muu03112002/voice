// discord.js バージョン14用のコード
const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder } = require('discord.js');

// 環境変数からトークンを取得
const token = process.env.TOKEN;

// ポート設定（環境変数またはデフォルト値）
const PORT = process.env.PORT || 3000;

// クライアントの初期化
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel]
});

// Botが起動したときのイベント
client.once('ready', () => {
  console.log(`${client.user.tag} が起動しました！`);
});

// メッセージに反応するイベント
client.on('messageCreate', async message => {
  // Botからのメッセージは無視
  if (message.author.bot) return;

  // !helpコマンドに反応
  if (message.content === '!help') {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('create_vc_button')
          .setLabel('VC作成')
          .setStyle(ButtonStyle.Primary),
      );

    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle('ボイスチャンネル作成ヘルプ')
      .setDescription('こちらからご自由にボイスチャンネルをカスタマイズし、作成出来ます。\n作成するボイスチャンネルの名前を設定し、VC作成ボタンを押してください。');

    await message.channel.send({ embeds: [embed], components: [row] });
  }
});

// ボタンクリックに反応するイベント
client.on('interactionCreate', async interaction => {
  // ボタンクリックでなければ無視
  if (!interaction.isButton()) return;

  // VC作成ボタンがクリックされた場合
  if (interaction.customId === 'create_vc_button') {
    // モーダルを作成（名前入力用のポップアップ）
    const modal = new ModalBuilder()
      .setCustomId('vc_name_modal')
      .setTitle('ボイスチャンネル名の設定');

    // テキスト入力フィールドを追加
    const vcNameInput = new TextInputBuilder()
      .setCustomId('vcNameInput')
      .setLabel('ボイスチャンネル名')
      .setPlaceholder('例: ゲーム部屋')
      .setRequired(true)
      .setStyle(TextInputStyle.Short);

    const firstActionRow = new ActionRowBuilder().addComponents(vcNameInput);
    modal.addComponents(firstActionRow);

    // モーダルを表示
    await interaction.showModal(modal);
  }
});

// モーダル送信に反応するイベント
client.on('interactionCreate', async interaction => {
  if (!interaction.isModalSubmit()) return;

  if (interaction.customId === 'vc_name_modal') {
    // 入力された名前を取得
    const vcName = interaction.fields.getTextInputValue('vcNameInput');
    
    try {
      // ボイスチャンネルを作成
      const voiceChannel = await interaction.guild.channels.create({
        name: vcName,
        type: 2, // 2 = ボイスチャンネル
        parent: interaction.channel.parent, // 同じカテゴリに作成
      });

      // 作成者をそのチャンネルに移動
      if (interaction.member.voice.channel) {
        await interaction.member.voice.setChannel(voiceChannel);
      }

      await interaction.reply({
        content: `✅ ボイスチャンネル「${vcName}」を作成しました！10秒間誰もいなくなると自動的に削除されます。`,
        ephemeral: true
      });

      // 空のチャンネルをチェックする関数を設定
      checkEmptyChannel(voiceChannel);

    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: 'ボイスチャンネルの作成中にエラーが発生しました。',
        ephemeral: true
      });
    }
  }
});

// 空のボイスチャンネルをチェックして削除する関数
function checkEmptyChannel(channel) {
  const interval = setInterval(async () => {
    // チャンネルがまだ存在するか確認
    try {
      // チャンネルをフェッチして最新の状態を取得
      const fetchedChannel = await client.channels.fetch(channel.id);
      
      // メンバーがいなくなったら
      if (fetchedChannel.members.size === 0) {
        // 通知を送信（関連テキストチャンネルがあれば）
        try {
          const textChannels = fetchedChannel.guild.channels.cache.filter(
            ch => ch.type === 0 && ch.name.includes(fetchedChannel.name)
          );
          
          if (textChannels.size > 0) {
            await textChannels.first().send(`ボイスチャンネル「${fetchedChannel.name}」は空になりました。10秒後に削除されます。`);
          } else {
            // テキストチャンネルがない場合は、同じカテゴリ内の最初のテキストチャンネルに通知
            const categoryTextChannels = fetchedChannel.guild.channels.cache.filter(
              ch => ch.type === 0 && ch.parent === fetchedChannel.parent
            );
            
            if (categoryTextChannels.size > 0) {
              await categoryTextChannels.first().send(`ボイスチャンネル「${fetchedChannel.name}」は空になりました。10秒後に削除されます。`);
            }
          }
        } catch (error) {
          console.error('通知の送信中にエラーが発生しました:', error);
        }
        
        // 10秒待機
        setTimeout(async () => {
          try {
            // もう一度チャンネルをフェッチして、まだ空かどうか確認
            const recheckChannel = await client.channels.fetch(channel.id);
            if (recheckChannel.members.size === 0) {
              await recheckChannel.delete();
              console.log(`ボイスチャンネル「${recheckChannel.name}」を削除しました。`);
            }
          } catch (error) {
            console.error('チャンネル削除中にエラーが発生しました:', error);
          }
          
          // このチャンネルのチェックを停止
          clearInterval(interval);
        }, 10000); // 10秒
      }
    } catch (error) {
      // チャンネルが既に削除されている場合
      console.error('チャンネルチェック中にエラーが発生しました:', error);
      clearInterval(interval);
    }
  }, 5000); // 5秒ごとにチェック
}

// Webサーバーのセットアップ (Koyeb用)
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Bot is running!');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Botにログイン
client.login(token);
