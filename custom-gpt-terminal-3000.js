//AWS:
//Where to put this file:
//Navigate to file manager: Webmin > Tools > File Manager
//Navigate to our folder:  home/ubuntu/node-summarize-folder-3005
//View @ http://lysle.net:3005/
//
//LOCAL:
//Open cmd
//cd C:\2023_AI_Projects\node-summarize-folder-3005
//node server3005.js
//view @ localhost:3005

//PURPOSE
//This is a normal chatgpt4 but it can store a directiveMessage using [SYSTEM] and it will reiterate that string to the terminal every time a messsage is sent to maintain context even if token maximum is reached

// local imports
const { UseMidjourney } = require("./Midjourney.js");
const { UseSummarizeFolder } = require("./SummarizeFolder.js");
const { StopSummarizeFolder } = require("./SummarizeFolder.js");
const { HandleUpload } = require('./SummarizeFolder.js');

// packages imports
require('dotenv').config();
const express = require('express');
const app = express();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const { Configuration, OpenAIApi } = require("openai");
const prettier = require('prettier');
const rateLimit = require("express-rate-limit");
const basicAuth = require('express-basic-auth');
const multer = require('multer');
const codeBlockMarker = '```';
const oldTokens = [];


// limit chinese script kids
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minutes
  max: 50, // limit each IP to 5 requests per windowMs
  message: "Too many requests, please try again later."
});
app.use(limiter); // apply rate limiter to all requests
app.use(basicAuth({
    users: { 'admin': 'Vadne123!' }, // username: 'admin', password: 'Vadne123!'
    challenge: true,
    realm: 'Imb4T3st4pp',
}))

//CONFIG: TWILIO API USAGE
var apiCalls=0;
var twilio = require('twilio');
var client = new twilio(process.env.TWILIO_ACCOUNT, process.env.TWILIO_AUTH); 
var twilioPhone = process.env.TWILIO_PHONE;
var phoneAlertNumber= process.env.TWILIO_ALERT_PHONE;

var fileTypes=".js,.txt,.cs,.py,.php,.html,.css,.cpp,.java,.rb,.swift,.xml,.json,.yml";

// configuration
let AI_NAME='[ChatGPT4]';
let DISPLAY_USER_NAME='[USER]';                            // note this needs to be the same as the index.js for spinny wheel to work
let directiveMsgDefault="Temperature:1.5  You are ChatGPT4, a helpful AI assistant.  Default programming languages are js, except C# for physics."; // this will be sent along with every messages
let directiveMsg=directiveMsgDefault;
let firstMsgHeader="Start a new conversation.";            // this will be sent along with first message each time a user connects
const MAX_TOKENS = 4096;                                   // Maximum token limit for GPT-4
const CHARACTERS_PER_TOKEN=5;                              // estimate of # of characters per token
let responses = [];
let oldTokenSummary=""; // the old token conversation summarized
let oldTokenFull = ""; // the old token conversation in full

// state variable that can be passed and referenced by modules
let state = {summarizeFolderFilesRemaining: 0}; // keeps track of how many files are remaining to summarize

// modify first message to make it clear to chatgpt that it had a header
if(firstMsgHeader!="") firstMsgHeader+=". The following is the first message to reply to:";

// allow wait while doing summarize-folder
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// set up chatgpt API
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);
const messages = [];

// Store files in a "files" directory.
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, 'files/')
  },
  filename: function(req, file, cb) {
    cb(null, file.originalname)
  }
})
const upload = multer({ storage: storage })



function escapeHtml(unsafe) {
  return unsafe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}


// set up express
app.use(express.static('public'));
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});
app.post('/upload', async (req, res, next) => {
  HandleUpload(req, res, next, fs);
}, upload.array('files'), function (req, res) {
  // You can perform server-side file validation here.
})

// reading and writing to files directory for summarize-files
const fs = require('fs-extra');
const path = require('path');
const util = require('util');

const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);
const readFile = util.promisify(fs.readFile);

async function readFilesRecursive(directory, fileTypes) {
  console.log(`Start readFIlesRecursive`);
  const dirents = await readdir(directory, { withFileTypes: true });
  const fileTypeList = fileTypes.split(",");

  const files = await Promise.all(
    dirents.map(async (dirent) => {
      const res = path.resolve(directory, dirent.name);

      if (dirent.isDirectory()) {
        console.log(`Checking directory: ${res}`);
        if (!res.includes("/node_modules/")) {
          console.log(`Reading directory: ${res}`);
          return readFilesRecursive(res, fileTypes);
        } else {
          console.log(`Ignoring directory: ${res}`);
          return [];
        }
      } else if (dirent.isFile() && fileTypeList.some((type) => dirent.name.endsWith(type))) {
        console.log(`Reading file: ${res}`);
        const content = await readFile(res, "utf-8");
        return res + "\n" + content;
      } else {
        return null;
      }
    })
  );

  return files.flat().filter((file) => file);
}

async function shortenSummaryWithGPT3(summary, maxTokens) {

  // Call the OpenAI API with user message as input
  const response = await openai.createChatCompletion({
    model: "gpt-3.5-turbo-16k",
    messages: [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "Please shorten the following text to "+(maxTokens)+" tokens.  If there is code, summarize the codes variables, functions, and the use of the code.  Explain the back and forth occuring between the user and system.: "+summary}
    ]
  });

  // Extract the model's response
  let modelResponse = response.data.choices[0].message.content.trim();  // get response
  return modelResponse;
}

function CountAPICalls()
{
  console.log("TOTAL API CALLS: "+apiCalls+" API calls performed) %10: "+(apiCalls%10));
  if(apiCalls%10==1)
  {
         console.log("Attempting twilio sms to "+phoneAlertNumber+ "("+apiCalls+" API calls performed)");
         client.messages.create({
             body: 'ChatGPTx10@'+PORT+" "+JSON.stringify(messages[messages.length-1]).substring(0,100)+"... ("+apiCalls+" API calls performed)",
             to: phoneAlertNumber,  // Text this number
             from: twilioPhone      // From a valid Twilio number
           })
           .then((message) => console.log(message.sid));
  }
  apiCalls++;
}

// connect to socket so that browser clients can connect, and watch for connects/disconnects
io.on('connection', (socket) => {
  console.log('A user connected');
  io.emit('chat message', `[USER CONNECTED]<br>`);
  msgHeaderToInclude=firstMsgHeader;           // a new user connected so need to resend the message header
  directiveMsg=directiveMsgDefault;            // a new user connected so reset the directive message
  while(messages.length) messages.pop();
  io.emit('chat message', `${AI_NAME}<br> Hello.  I am chatGPT with midjourney, summarize-folder, summarize-old-tokens.  What can I help you with?<br>`);          // send html to all clients

  socket.on('disconnect', () => {
    console.log('User disconnected');
	io.emit('chat message', `[USER DISCONNECTED]<br>`);
  });

// API cannot handle too many tokens aka long messages variable, so move old messages to a separate array to prevent 404 error
function truncateMessagesToLength(messages, maxTokens) {
  let maxLength=maxTokens*CHARACTERS_PER_TOKEN;
  let totalLength = messages.reduce((sum, msg) => sum + msg.content.length, 0);

  while (totalLength > maxLength && messages.length > 1) {
    console.log('[truncate] need to remove a message bc '+totalLength+' > '+maxLength+'');
    const removedMessage = messages.shift();
    totalLength -= removedMessage.content.length;
    oldTokens.push(removedMessage);
    console.log(`adding ${removedMessage.content} to oldTokens`);
  }

  if (oldTokens.length > 0) {
    UseSummarizeOldTokens(oldTokens);
  }
}

const PERCENTAGE_OF_MAX_TOKENS_SUMMARIZE_OLD_TOKENS=0.5;   // What percentage of total tokens should the summarization of the old tokens take up?
// Function to handle old tokens
async function UseSummarizeOldTokens(oldTokens) {
  console.log("Processing old tokens:", oldTokens);
  oldTokens.forEach((token) => {
    oldTokenFull += `[${token.role} Message]: ${token.content}\n\n`;
  });

  let maxCharOldToken=16384*CHARACTERS_PER_TOKEN;
  if(oldTokenFull>maxCharOldToken)
  {
      // even chatgpt3 cant handle this amount of oldtokens.  we need to refresh oldTokens with a summary instead of full conversation
      const reply = await shortenSummaryWithGPT3(oldTokenFull.substring(0,maxCharOldToken),maxCharOldToken*0.4);   // we will lose a little data due to substring, hopefully nothing too important
      oldTokenSummary = reply;
      oldTokens=[{ role: "user", content: "These are the oldest messages sent: "+reply }]; // also replace oldTokens so this doesnt happen next time too
  }
  else 
  {
    const reply = await shortenSummaryWithGPT3(oldTokenFull,MAX_TOKENS*PERCENTAGE_OF_MAX_TOKENS_SUMMARIZE_OLD_TOKENS);
    oldTokenSummary = reply;
  }
}

// extract the message between [SYSTEM] and [/SYSTEM] from the user or system's chat
function extractAndRemoveTags(msg, type) {
  let regex = /\[SYSTEM\](.*?)\[\/SYSTEM\]/si;
  if(type.toUpperCase() == "HIDDEN") 
  {
    // not a directive message
    regex = /\[HIDDEN\](.*?)\[\/HIDDEN\]/si;
    msg = msg.replace(regex, '').trim();
  }
  else if(type.toUpperCase()=="SYSTEM")
  {
    // [SYSTEM] indicates directive message
    const match = msg.match(regex);
    if (match) {
        directiveMessage = match[1].trim();
        msg = msg.replace(regex, '').trim();
        console.log("New System Message: "+directiveMessage);
    		io.emit('chat message', `[SYSTEM DIRECTIVE UPDATED]<br><br>`);
    }
	}
  return msg;
}

function updateSystemDirective()
{
  	// update messages (this saves chat history)
	for (let i = messages.length - 1; i >= 0; i--) {     // clear previous directive messages, only one needs to be included and it will be the current one
	  if (messages[i].role === "system"&&messages[i].content.substring(0,10)=="Directive:") {
		messages.splice(i, 1);
	  }
	}
	messages.push({ role: "system", content: "Directive: "+directiveMsg });            // remember the current directive and keep it at forefront
}

function updateOldTokenSummary()
{
  	// update messages (this saves chat history)
	for (let i = messages.length - 1; i >= 0; i--) {     // clear previous directive messages, only one needs to be included and it will be the current one
	  if (messages[i].role === "system"&&messages[i].content.substring(0,25)=="Older Conversation Summary: ") {
		messages.splice(i, 1);
	  }
	}
	messages.unshift({ role: "system", content: "Older Conversation Summary: "+oldTokenSummary });            // remember the current oldTokenSummary and keep it at the back
}


  // a browser client has sent a message to this server
  socket.on('chat message', async (msg) => {

    // extract new system message from message text
    msg = extractAndRemoveTags(msg, "SYSTEM");

    updateSystemDirective();
    updateOldTokenSummary();
    messages.push({ role: "user", content: msgHeaderToInclude+msg });       // remember the users message
    msgHeaderToInclude="";    

    console.log("\nClient Message: "+msgHeaderToInclude+msg);                       // display to console
    //console.log("\Messages: "+JSON.stringify(messages));       // display entire message log to console to better evaluate first message header and directive

    io.emit('chat message', `${DISPLAY_USER_NAME}<br> ${escapeHtml(msg)}<br>`);          // send html to all clients

    try {
      			
		   	// Warn API owner that script is executing
			CountAPICalls();
      
      // DO SUMMARIZE-FOLDER
      if(msg.substring(0,15).toLowerCase()=="summarize-folder ".substring(0,15)||msg.substring(0,12).toLowerCase()=="summarize-files ".substring(0,12))
      {
        if(state.summarizeFolderFilesRemaining==0) UseSummarizeFolder(state, fileTypes, io, openai, messages, responses, AI_NAME, MAX_TOKENS, apiCalls, readFilesRecursive, CountAPICalls, truncateMessagesToLength, sleep, shortenSummaryWithGPT3);
        else StopSummarizeFolder(state, io);
        return;         // dont send to chatgpt if we send to summarize-folder
      }
      if(msg.substring(0,4).toLowerCase()=="stop ".substring(0,4) && state.summarizeFolderFilesRemaining>0)
      {
        StopSummarizeFolder(state, io);
        return;         // dont send to chatgpt if we send to summarize-folder
      }

      // DO MIDJOURNEY
      if(msg.substring(0,10).toLowerCase()=="midjourney ".substring(0,10)||msg.substring(0,7).toLowerCase()=="imagine ".substring(0,7))
      {
        UseMidjourney(msg, DISPLAY_USER_NAME, AI_NAME, io);
        return;         // dont send to chatgpt if we send to midjourney
      }

      // DISPLAY SYSTEM MESSAGE directiveMsg
      if(msg.substring(0,10).toLowerCase()=="display directive message".substring(0,10)||msg.substring(0,7).toLowerCase()=="display system message".substring(0,10))
      {
        io.emit('chat message', `${AI_NAME}<br> My Current Directive: ${directiveMsg==""?"None":directiveMsg}<br>`);          // send html to all clients
        return;         // dont send to chatgpt if we send to midjourney
      }

      // DISPLAY OLDTOKENS oldTokenSummary
      if(msg.substring(0,10).toLowerCase()=="display old token summary".substring(0,10)||msg.substring(0,7).toLowerCase()=="display token summary".substring(0,10))
      {
        io.emit('chat message', `${AI_NAME}<br> Old Token Summary: ${oldTokenSummary==""?"None":oldTokenSummary}<br>`);          // send html to all clients
        return;         // dont send to chatgpt if we send to midjourney
      }

      // DISABLE BOT FOR TESTING
      //io.emit('chat message', `${AI_NAME}<br> Bot is disabled<br><br>`);
      //return;

      // DO CHATGPT
      // Call the OpenAI API with user message as input
      const response = await openai.createChatCompletion({
        model: "gpt-4-0314",
        messages: messages,
      });

      // Extract the model's response
      let modelResponse = response.data.choices[0].message.content.trim();  // get response
      messages.push({ role: "system", content: modelResponse });            // remember gpt's response
	    truncateMessagesToLength(messages, MAX_TOKENS * PERCENTAGE_OF_MAX_TOKENS_SUMMARIZE_OLD_TOKENS);   // do not allow messages to become so long that API fails (summarize old messages)

	  // Format the code block using prettier
	  modelResponse=modelResponse.replace(codeBlockMarker+"javascript",codeBlockMarker);
	  modelResponse=modelResponse.replace(codeBlockMarker+"html",codeBlockMarker);
	  modelResponse=modelResponse.replace(codeBlockMarker+"css",codeBlockMarker);
	  modelResponse=modelResponse.replace(codeBlockMarker+"csharp",codeBlockMarker);
	  const block = modelResponse.split(codeBlockMarker);
	  let formattedResponse = '';
	  for(let i=0;i<block.length;i++)
		{
		  if (block[i]) {
			try {
			  formattedResponse += "<div>"+escapeHtml(prettier.format(block[i], {
				parser: 'babel',
			  }))+"</div>";
			  console.error('Success formatting:', i);
			  console.error('formattedResponse:', formattedResponse);

			} catch (error) {
			  console.error('Error formatting:', i);
			  if(i%2==1) formattedResponse += "<div>"+escapeHtml(block[i])+"</div>";   // odd numbers
        else formattedResponse += escapeHtml(block[i]); // make < and > display as they are and not create injection vulnerabilities
			  console.error('formattedResponse:', formattedResponse);
			}
		  }
		}

    // format for imagine midjourney prompts
    formattedResponse=formattedResponse.replace("::","::5");

      // extract new system message from message text and remove it from message
      formattedResponse = extractAndRemoveTags(formattedResponse, "SYSTEM");

      // Send the model's response to all clients
      io.emit('chat message', `${AI_NAME}<br> ${formattedResponse}<br><br>`);
   	  console.log("\nAPI Message: "+formattedResponse.replace(/\n/g, ' ').substring(0,200000));

       // allow chatGPT to call to midjourney
       if(formattedResponse.substring(0,10).toLowerCase()=="midjourney ".substring(0,10)||formattedResponse.substring(0,7).toLowerCase()=="imagine ".substring(0,7))
       {
         UseMidjourney(formattedResponse, DISPLAY_USER_NAME, AI_NAME, io);
       }
	} 
	catch (error) {
      console.error(error);
      io.emit('chat message', `${AI_NAME}<br> I'm sorry, but there was an error processing your request: ${(error.response ? error.response.status : 'Unknown Status')} ${(error.response ? error.response.statusText : 'Unknown Error')} <br>`); 
    }
  });
});



// connect server to a port so browser clients can connect
const PORT = process.env.PORT;
http.listen(PORT, () => {
  console.log(`Listening on *:${PORT}`);
});