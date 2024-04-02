const { join } = require("path");

const PERCENTAGE_OF_MAX_TOKENS_SUMMARIZE_FOLDER=0.5;       // What percentage of total tokens should the summarization of the folder take up?

function StopSummarizeFolder(state, io)
{
  io.emit('chat message', `[SUMMARIZE FOLDER]<br>Stopping summarize folder with ${state.summarizeFolderFilesRemaining} files incomplete.`);
  state.summarizeFolderFilesRemaining=0;
}

const UseSummarizeFolder = async (state, fileTypes, io, openai, messages, responses, AI_NAME, MAX_TOKENS, apiCalls, readFilesRecursive, CountAPICalls, truncateMessagesToLength, sleep, shortenSummaryWithGPT3) => {
  readFilesRecursive('./files', fileTypes, {ignored: '**/node_modules/**'})
      .then(async (contents) => 
      {
          responses=[];
          inde=0;
          for(const content of contents){
            inde++;
            if(contents.length>30) 
            {
              io.emit('chat message', `[SUMMARIZE FOLDER]<br>Sorry.  Cannot summarize ${contents.length} files.  Maximum: 30 files.`);
              return;
            }
            
            // Your code to send content to ChatGPT API
            console.log("sending to chatGPT from readcsfiles: "+content);
            io.emit('chat message', `[SUMMARIZE FOLDER]<br>Summarizing file ${inde}/${contents.length}.  <br> Next File: ${content.split("\n")[0]}`);
            state.summarizeFolderFilesRemaining=1+contents.length-inde;

            try {
                
              // Warn API owner that script is executing
              console.log("TOTAL API CALLS: "+apiCalls+" API calls performed) %10: "+(apiCalls%10));
              CountAPICalls();
        
              // set up the message
              summarizeFolderHeader="Summarize the following content.  If it is code, write \"Description of (class name):\" then summarize the class and the flow of the code in paragraph format, and then write \"Functions and Variables of (class name):\" and list without numbers each function and variable (describing each in 1-8 words). Here is the content: <br>";
              let CHARACTERS_PER_TOKEN=5;
              let MAX_TOKENS = 4096;
              let messages=[{ role: "user", content: (summarizeFolderHeader+content).substring(0, MAX_TOKENS*CHARACTERS_PER_TOKEN) }];

              // Call the OpenAI API with user message as input
              const response = await openai.createChatCompletion({
                model: "gpt-4-0314",
                messages: messages,
              });

              // make sure summarize folder hasnt been cancelled
              if(state.summarizeFolderFilesRemaining == 0)
              {
                io.emit('chat message', `${AI_NAME}<br> Stopping summarize-folder was a success.<br>`);          // send html to all clients
                return;
              }
        
              // Extract the model's response
              let modelResponse = response.data.choices[0].message.content.trim();  // get response
              responses.push(modelResponse);                             // remember gpt's responses
              messages.push({ role: "system", content: modelResponse });            // remember gpt's response
              io.emit('chat message', `${AI_NAME}<br>${modelResponse}`);
  
              // wait to not overwhelm chatgpt
              await sleep(1000);
            } 
            catch (error) {
              console.error(error);
              let contentLength = error.response.request._contentLength;
                io.emit('chat message', `${AI_NAME}<br> I'm sorry, but there was an error processing your request: ${error.response.status} ${error.response.statusText} (Length: ${contentLength})<br>`);          // send html to all clients
                state.summarizeFolderFilesRemaining=0;
            }
          }
  
          // have all responses- display to user
          let summary = responses.join("<br><br>");
  
          // Check if summary is too long for GPT-4
          if (summary.length / 4 > MAX_TOKENS) {
              // create and display short summary
              io.emit('chat message', `[SUMMARIZE FOLDER]<br>Summary is complete.  Shortening summary with ChatGPT3 to make it usable in ChatGPT4.<br><br>`);
              const shortenedSummary = await shortenSummaryWithGPT3(summary, MAX_TOKENS*PERCENTAGE_OF_MAX_TOKENS_SUMMARIZE_FOLDER);
              io.emit('chat message', `[SUMMARIZE FOLDER]<br>Shortened Summary is complete.  Here is the summary:<br><br> ${shortenedSummary}<br><br>`);
              console.log("\n[FINAL SUMMARIZE FOLDER RESPONSE] "+shortenedSummary);
              state.summarizeFolderFilesRemaining=0;
          }
          else 
          {
            // display long summary
            io.emit('chat message', `[SUMMARIZE FOLDER]<br>Summary is complete.  Here is the full summary:<br><br> ${summary}<br><br>`);
            console.log("\n[FINAL SUMMARIZE FOLDER RESPONSE] "+summary);
            state.summarizeFolderFilesRemaining=0;
          }
      }
    )
    .catch((err) => console.error(err));
  }

  async function HandleUpload(req, res, next, fs)
{
  try {
    const uploadedFiles = req.files || [];

    if (uploadedFiles.length > 30) {
      res.status(400).send('Error: More than 30 files were uploaded.');
      return;
    }

    await fs.emptyDir('files/');
    next();
  } catch (err) {
    console.error(err);
    res.status(500).send('Error emptying directory.');
  }
}
  
  module.exports = {
    UseSummarizeFolder: UseSummarizeFolder,
    StopSummarizeFolder: StopSummarizeFolder,
    HandleUpload: HandleUpload,
  };