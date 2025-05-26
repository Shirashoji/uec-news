/**
 * スクリプトの初期設定を行います。
 * 初回実行時にSlackトークン、チャンネルID、ボット名、アイコンなどを設定します。
 * これらの値はPropertiesServiceに保存されます。
 */
function initialize() {
  const scriptProperties = PropertiesService.getScriptProperties();
  // Slack Bot Token (xoxb-で始まるトークン)
  scriptProperties.setProperty("SLACK_TOKEN", "xoxb-");
  // Slack Channel ID (Cで始まるチャンネルID)
  scriptProperties.setProperty("SLACK_CHANNEL_ID", "C0000000000");
  // 最後に通知したニュースのリンクを保存するプロパティ
  scriptProperties.setProperty("LAST_ANNOUNCEMENT_LINK", "");
  // Slackボットの名前
  scriptProperties.setProperty("BOT_NAME", "UEC News Bot");
  // Slackボットのアイコン絵文字
  scriptProperties.setProperty("BOT_ICON", ":uec:");
}

/**
 * UECのニュースをスクレイピングし、新しいニュースがあればSlackに通知します。
 */
function checkAndNotifyNews() {
  const scriptProperties = PropertiesService.getScriptProperties();
  const lastAnnouncementLink = scriptProperties.getProperty(
    "LAST_ANNOUNCEMENT_LINK",
  );

  try {
    const htmlContent = fetchNews("https://www.uec.ac.jp/news/announcement/");
    const newsItems = parseNews(htmlContent);

    if (newsItems.length === 0) {
      console.log("ニュースが見つかりませんでした。");
      return;
    }

    let newAnnouncements = [];
    let foundLastAnnouncement = false;

    // 新しいニュースを特定
    for (let i = 0; i < newsItems.length; i++) {
      if (newsItems[i].url === lastAnnouncementLink) {
        foundLastAnnouncement = true;
        break;
      }
      newAnnouncements.push(newsItems[i]);
    }

    // 最新のニュースをPropertiesServiceに保存
    if (newsItems.length > 0) {
      scriptProperties.setProperty("LAST_ANNOUNCEMENT_LINK", newsItems[0].url);
    }

    if (newAnnouncements.length > 0) {
      // 新しいニュースを逆順にして、古いものから通知
      newAnnouncements.reverse().forEach((news) => {
        const message = `【新着ニュース】\nタイトル: ${news.title}\nURL: ${news.url}\n日付: ${news.date}`;
        sendSlackMessage(message);
        // Slack APIのレートリミットを考慮して少し待機
        Utilities.sleep(1000);
      });
      console.log(
        `${newAnnouncements.length}件の新しいニュースをSlackに通知しました。`,
      );
    } else {
      console.log("新しいニュースはありませんでした。");
    }
  } catch (e) {
    console.error("ニュースの確認と通知中にエラーが発生しました: " + e.message);
    sendSlackMessage("ニュースの確認中にエラーが発生しました: " + e.message);
  }
}

/**
 * 指定されたURLからHTMLコンテンツを取得します。
 * @param {string} url - 取得するURL
 * @returns {string} HTMLコンテンツ
 */
function fetchNews(url) {
  const response = UrlFetchApp.fetch(url);
  return response.getContentText();
}

/**
 * HTMLコンテンツからニュース項目を解析します。
 * @param {string} htmlContent - HTMLコンテンツ
 * @returns {Array<Object>} ニュース項目の配列 (例: [{ title: "...", url: "...", date: "..." }])
 */
function parseNews(htmlContent) {
  const $ = Cheerio.load(htmlContent);
  const newsItems = [];

  // Find all links on the page that might be news links
  $("a[href]").each((i, elem) => {
    const url = $(elem).attr("href");
    let title = $(elem).text().trim();
    // Remove the date from the beginning of the title if present
    title = title.replace(/^\d{4}\.\d{2}\.\d{2}\s*/, "").trim();
    // Replace multiple spaces/newlines with a single space for cleaner output
    title = title.replace(/\s+/g, " ");

    // Heuristic: news links usually have a non-empty title and a date nearby.
    if (title.length > 0) {
      let date = "";
      // Check if the date is in a preceding sibling (e.g., a span or dt)
      const prevSibling = $(elem).prev();
      if (
        prevSibling.length &&
        prevSibling.text().match(/\d{4}\.\d{2}\.\d{2}/)
      ) {
        date = prevSibling.text().match(/(\d{4}\.\d{2}\.\d{2})/)[1];
      } else {
        // Check if the date is in a parent's sibling (e.g., <dd><a/></dd><dt>Date</dt>) - less likely
        const parent = $(elem).parent();
        const parentPrevSibling = parent.prev();
        if (
          parentPrevSibling.length &&
          parentPrevSibling.text().match(/\d{4}\.\d{2}\.\d{2}/)
        ) {
          date = parentPrevSibling.text().match(/(\d{4}\.\d{2}\.\d{2})/)[1];
        } else {
          // Check if the date is in the text of the parent or a close ancestor
          const ancestorText = $(elem).closest("div, p, li").text(); // Search in closest block element
          const dateMatch = ancestorText.match(/(\d{4}\.\d{2}\.\d{2})/);
          if (dateMatch) {
            date = dateMatch[1];
          }
        }
      }

      // Filter out irrelevant links (e.g., navigation, social media, internal anchors)
      // A news link should typically point to a news article or announcement.
      // Let's assume news links contain "/news/" or "/announcement/" in their URL.
      if (date && (url.includes("/news/") || url.includes("/announcement/"))) {
        const absoluteUrl = url.startsWith("http")
          ? url
          : "https://www.uec.ac.jp" + url;
        newsItems.push({ title, url: absoluteUrl, date });
      }
    }
  });

  // Sort news items by date in descending order (most recent first)
  newsItems.sort((a, b) => {
    const dateA = new Date(a.date.replace(/\./g, "-"));
    const dateB = new Date(b.date.replace(/\./g, "-"));
    return dateB.getTime() - dateA.getTime();
  });

  return newsItems;
}

/**
 * Slackにメッセージを送信します。
 * @param {string} message - 送信するメッセージ
 */
function sendSlackMessage(message) {
  const scriptProperties = PropertiesService.getScriptProperties();
  const slackToken = scriptProperties.getProperty("SLACK_TOKEN");
  const slackChannelId = scriptProperties.getProperty("SLACK_CHANNEL_ID");
  const botName = scriptProperties.getProperty("BOT_NAME");
  const botIcon = scriptProperties.getProperty("BOT_ICON");

  const payload = {
    channel: slackChannelId,
    text: message, // Fallback text for notifications
    username: botName,
    icon_emoji: botIcon,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: message,
        },
      },
    ],
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    headers: {
      Authorization: "Bearer " + slackToken,
    },
    muteHttpExceptions: true, // エラー発生時でも例外を投げない
  };

  try {
    UrlFetchApp.fetch("https://slack.com/api/chat.postMessage", options);
    console.log("Slackにメッセージを送信しました。");
  } catch (e) {
    console.error(
      "Slackへのメッセージ送信中にエラーが発生しました: " + e.message,
    );
  }
}
