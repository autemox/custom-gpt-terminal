//set up midjourney
global.fetch = require('node-fetch');            // node-fetch@2.6.1 needed for midjourney
const { Midjourney } = require('midjourney');

async function generateImage(prompt, io) {
  const client = new Midjourney({
    ServerId: process.env.SERVER_ID,
    ChannelId: process.env.CHANNEL_ID,
    SalaiToken: process.env.SALAI_TOKEN,
    Debug: true,
    Ws: true,
  });
  await client.Connect();
  const Imagine = await client.Imagine(prompt, (uri, progress) => {
    console.log("Imagine.loading", uri, "progress", progress);
    io.emit('chat message', "MIDJOURNEYLOADING|" + progress + "|" + uri);
  });
  console.log({ Imagine });
  client.Close();
  return Imagine;
}

const UseMidjourney = async (msg, DISPLAY_USER_NAME, AI_NAME, io) => {
  msg = msg.replace("midjourney", "");
  msg = msg.replace("imagine", "");
  msg = msg.replace(DISPLAY_USER_NAME + "<br></br>", "");
  msg = msg.replace("<br>" + AI_NAME + "<br> ", "");
  msg = msg.replace(/[.\s]+$/, '');  // remove periods from end of string, midjourney hates those it ruins aspect ratio
  console.log("Sending request to midjourney: '" + msg + "'");
  io.emit('chat message', `<br>[MIDJOURNEY]<br>Image Pending...<br><br>`);

  generateImage(msg, io)
    .then((result) => {
      console.log("Image generated:", result.uri);
      io.emit('chat message', "MIDJOURNEYLOADING|100|" + result.uri);
    })
    .catch((err) => {
      console.error(err);
      io.emit('chat message', "MIDJOURNEYLOADING|-1|" + err);
    });
  return;
}

module.exports = {
  UseMidjourney
};
