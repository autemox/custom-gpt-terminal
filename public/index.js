const socket = io();
const messageBox = document.getElementById("message-box");
const chatBox = document.getElementById("chat-box");
const sendButton = document.getElementById('send-button');
const prettier = window.prettier;
let lastLoad=0;

window.onload = function() {
  // look for ?midjourney tag in url
  if(window.location.search == "?midjourney") toggleOption('chatGPTAssist');
  if(window.location.search == "?summarize-folder") sendSpecificMessage("summarize-folder");
};

	// our options for our expanded terminal
    var options = {
      chatGPTAssist: false,
      showHidden: false,
      hideLast: false
    };

	var mj_style="";

    // toggle the options
    function toggleOption(optionName) {
      var checkbox = document.querySelector(`[onclick="toggleOption('${optionName}')"]`);
      options[optionName] = !options[optionName];
      console.log(`${optionName}:`, options[optionName]);
      
    }

    function setText(text)
    {
      document.getElementById("message-box").value = text;
    }

    function toggleVisibility(id) {
      const myElement = document.getElementById(id);
      if(myElement.style.display == "inline") myElement.style.display = "none";
      else myElement.style.display = "inline"
    }

// pre select the options
document.addEventListener("DOMContentLoaded", function() {
    var url = window.location.href;

    if (url.indexOf('midjourney') > -1) {
        document.getElementById('chatGPTAssist').checked = true;
    }

    if (url.indexOf('hidden') > -1) {
        document.getElementById('showHidden').checked = true;
    }

    if (url.indexOf('short') > -1) {
        document.getElementById('hideLast').checked = true;
    }
});

// pull down style change
function handleSelectChange(event) {
    const selectedOptionValue = event.target.value;
    console.log('You selected:', selectedOptionValue);
	if(selectedOptionValue=="hyper realism") mj_style = "::: Octane render, Unreal engine, photograph, realistic skin texture, photorealistic, hyper realism, highly detail";
    else mj_style=selectedOptionValue;
}

let DISPLAY_USER_NAME='[USER]';                                 // note this needs to be the same as the server.js for spinny wheel to work

messageBox.addEventListener("input", resizeMessageBox);
messageBox.addEventListener("keydown", handleEnterPress);

function unescapeHtml(safe) {
  return safe.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
             .replace(/&quot;/g, "\"").replace(/&#039;/g, "'");
}

function addImgTags(string) {
  const regex = /(https?:\/\/.*\.(?:png|jpg|webp))/gi;
  const imageUrls = string.match(regex);
  if (imageUrls !== null) {
    const imageTags = [];
    imageUrls.forEach((url) => {
      const imgTag = `<img src="${url}" alt="Image">`;
      imageTags.push(imgTag);
    });
    // Replace the image URLs with img tags in the original string
    let result = string;
    imageUrls.forEach((url, index) => {
      result = result.replace(url, imageTags[index]);
    });
    return result;
  }
  return string;
}

// remove last sentence of whatever ChatGPT4 says
function removeLastIfNoDialogue(str) {
    if(str==undefined) return str;
    const abbreviations = ['Dr.', 'Mr.', 'Mrs.', 'Ms.'];    // Define abbreviations to ignore.
    const placeholders = ['<dr>', '<mr>', '<mrs>', '<ms>'];
    for (let i = 0; i < abbreviations.length; i++) {    // Replace abbreviations with placeholders.
        let regex = new RegExp(abbreviations[i], 'g');
        str = str.replace(regex, placeholders[i]);
    }
    let sentences = str.match(/[^\.!\?]+[\.!\?]+/g);  // Split the string into sentences.
    if (sentences.length > 1) {  
        let lastSentence = sentences[sentences.length - 1];// Check if the last sentence contains a dialogue.
        let quoteIndex = lastSentence.indexOf('"');// A dialogue is assumed to be present if there is a quote that is not the first character.
        if (quoteIndex <= 0 || quoteIndex == 1) {
            sentences.pop();                                // If it doesn't contain a dialogue, remove it
        }
    }
    let result = sentences.join("");   // Join the sentences back into a string.
    for (let i = 0; i < placeholders.length; i++) {  // Replace placeholders with original abbreviations.
        let regex = new RegExp(placeholders[i], 'g');
        result = result.replace(regex, abbreviations[i]);
    }
    return result;
}

// extract the message between [SYSTEM] and [/SYSTEM] from the user or system's chat
function removeHidden(msg) {
let regex = /\n*\[HIDDEN\](.*?)\[\/HIDDEN\]\n*/gs;

    return(msg.replace(regex, '').trim());
}

// handle hitting enter key
function handleEnterPress(e) {                                // CTRL ENTER SENDS
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    sendMessage();
  }
}

function resizeMessageBox() {                                // DNYMAIC MESSAGE BOX SIZE
  messageBox.style.height = "4rem";
  messageBox.style.height = (messageBox.scrollHeight<400?messageBox.scrollHeight : 400) + "px";
}

const messagesContainer = document.getElementById("messages-container");

async function displayTextSlowly(text) { 
  //text=unescapeHtml(addImgTags(text));
  console.log("attempting to display: "+text);
  // The same logic from addTextOneWordAtATime function
  text = text.replaceAll("\n", "<br>");
  text = text.replaceAll("  ", "&nbsp;&nbsp;");
  text = text.replaceAll("</div><br>", "</div>");
  text = text.replaceAll("<div>", " <div> ");
  text = text.replaceAll("</div>", " </div> ");
  text = text.replaceAll("<img", " <img");
  text = text.replaceAll("<img", " <img");

  let words = text.split(" ");
  let imageOrDivStartIndex = null;

  // Identify 'div' and 'img' tags and prevent them from being split
  ignoreNext=false;
  words = words.reduce((newWords, word, index) => {
      if(ignoreNext) { ignoreNext=false; return newWords; }

      if (word.startsWith("<div") || word.startsWith("<img")) {
          imageOrDivStartIndex = index;
          console.log("found a div at: "+index);
      }
      else if (word.endsWith("</div>") || word.endsWith(">") && imageOrDivStartIndex !== null) {
          newWords.push(words.slice(imageOrDivStartIndex, index + 1).join(" "));
          console.log("found the end of a div at: "+index);
          console.log("adding words between: "+imageOrDivStartIndex+" and "+index);
          console.log("adding words: "+words.slice(imageOrDivStartIndex, index + 1).join(" "));
          imageOrDivStartIndex = null;
          ignoreNext=true;
      } 
      else if (imageOrDivStartIndex === null) {
          newWords.push(word);
          console.log("no div found.  adding: "+word);
      }
      return newWords;
  }, []);

  const item = document.createElement("div");
  item.classList.add("rich-text-area");
  messagesContainer.appendChild(item);

  const textSpeed = text.length > 5000 ? 1 : text.length > 1000 ? 10 : text.length > 500 ? 25 : 50;

  for (const word of words) {
      item.innerHTML += word + " ";
      chatBox.scrollTop = chatBox.scrollHeight;
      await new Promise((resolve) => setTimeout(resolve, textSpeed));

      // Resize images to match textarea width
      const images = item.getElementsByTagName('img');
      for(let img of images) {
          img.style.width = "100%";
          img.style.height = "auto";
      }
  }
}

const spinner = document.getElementById("spinner");

function showSpinner() {
  spinner.classList.remove("hidden");
  sendButton.classList.add('disable-button');
  sendButton.classList.remove('enable-button');
}

function hideSpinner() {
  spinner.classList.add("hidden");
  sendButton.classList.remove('disable-button');
  sendButton.classList.add('enable-button');
}

function updateMidjourneyDiv(withText) {
  const messages = messagesContainer.children;
  for (let i = 0; i < messages.length; i++) {
      let currentMessage = messages[i].innerHTML;

      if (currentMessage.includes("Image Pending...") || currentMessage.includes("Image Loading...")) {
          messages[i].innerHTML = withText;
      }
  }
}

// Inside the socket.on('chat message') event
socket.on("chat message", (msg) => {
  
  console.log("|"+msg+"|");
  
  // handle midjourney updates
  if(msg.substring(0,17)=="MIDJOURNEYLOADING|".substring(0,17))
  { 
    console.log("found midjourney loading");
     mj_loading=msg.split("|");
     if(mj_loading[1]=="100") updateMidjourneyDiv("[MIDJOURNEY]<br>Completed Image: <br> "+addImgTags(mj_loading[2]));
     if(mj_loading[1]=="-1") updateMidjourneyDiv("[MIDJOURNEY]<br>Error. Image failed. <br> "+mj_loading[2]);
     else updateMidjourneyDiv("[MIDJOURNEY]<br>Image Loading... "+mj_loading[1]+"  <br>"+addImgTags(mj_loading[2]));

     return;
  }
  
  // remove hidden messages
  if(!options.showHidden) msg=removeHidden(msg);

  // handle messages from server
  if(msg.trim()!="" && msg.substring(0, 4)!=DISPLAY_USER_NAME.substring(0, 4) && msg.substring(0, 4)!="[SYSTEM".substring(0, 4)) {
	  hideSpinner();
	  if(options.hideLast) 
	  {
		  msg=removeLastIfNoDialogue(msg);   // remove last sentence
		  msg+="<br><br>";
	  }
  }

  // display the text, slowly
  displayTextSlowly(msg);
});

function sendMessage() {
  const message = messageBox.value.trim();
	let premsg = options.chatGPTAssist ? '[HIDDEN]You are a prompt generator for a Stable Diffusion-based image bot named Midjourney. Start by writing the word "Imagine", never start your response with anything else.  Rules: Your prompts never exceed 60 words. You do not say ANYTHING except for the prompts you provide. For each request, provide a creative and unique prompt. You do not use prepositional phrases. Your prompts are concise and robotic. No full sentences. No emotion. Nouns, verbs, and adjectives only.  Here is the format of the prompts you will generate, including spacing: imagine prompt: [your prompt].  Your prompt will follow the following structure: Main subject :: Environment. :: Composition :: lighting :: color :: mood :: medium :: style :: aspect ratio.  Main Subject:  Should be a simple sentence describing the subject of the image. There should be no other subjects in your prompt.  Decide if its a single subject or multiple subjects in the image.  If it is a single subject (person or thing), use 2-5 adjectives to describe the subjects face and hair.  For example: "Young girl curly red hair freckles beautiful sad", "greasy black hair boy with big hook nose scared cowering".  If it is multiple subjects, be less specific.  For example: "Three friends arguing about money", "A businessman shoving an astronaut", "An android and a child waltzing in a ballroom", "Twins watching a massive paper airplane in a field", "Group of knights", "A group of monsters", "50 crows", "A horde of rats", "A crew of a spaceship", "A velociraptor stampede", "A soccer match", "angry gorilla leaps at peanut vendor", "Dining out", "A birthday party", "Shopping at the mall", "A stage play". Environment: Should be a very short description of the setting. Nouns or Adjective-noun combinations are appropriate. Examples might include: "outer space" or "lush garden" or  "quiet suburb".  Composition: OPTIONAL Choose an appropriate image composition for each prompt. Examples include: Portrait, close-up, wide-shot, cinematic, overhead view, action shot, profile, reverse view, etc.  Lighting: OPTIONAL - if desired, consider lighting descriptions appropriate for the image. Examples might include "soft lighting," "ambient lighting" "studio lighting" "overcast" "bright" etc.  Color: OPTIONAL - if desired, consider color constraints for the image prompts. Examples might include "vibrant," "muted,"  "monochromatic," "black and white,"  "pastel," etc.   Mood: OPTIONAL - if desired, consider mood descriptors for the image.  Examples might include "sedate," "calm," "adventure," "thrilling," "romantic," "hopeful," "futuristic," "complex," etc.  Medium - If a photo-realistic image is desired, leave this blank. Otherwise, consider different media for each prompt. For example, "photography," "illustration," "digital illustration," "comic," "concept art," "sculpture," "storyboard," "3d render," "pixel art" "gauche painting"   Style - Style should include some or multiple style references that can include artist, media titles, techniques, time periods, art movements, and cultures. Here are some examples: "Impressionism," "Fine art," "Pop Art," "Vincent van Gogh," "Banksy," "Pencil sketch," "watercolor," "Renaissance," "Hayao Miyazaki," "Pixar," "Tribal art," "Modernist," "Anime," "Oil painting," "Spirited away," "highly complex".  Aspect Ratio - Aspect ratio should reflect the desired use or medium expressed by the user.  If the user says they want a book cover, the aspect ratio should be appropriate for that use. Aspect ratio is given as two integers with a colon between, like 16:9 or 3:4  Aspect ratio is expressed with the following format, including spaces: --ar 16:9     If the user describes the use or medium for the image (blog post, book cover, poster, etc.) the aspect ratio should be the same in every prompt and match the aspect ratio for that medium.  Midjourney can NOT create text, so do NOT prompt it to use text in an image, or to label anything.  Be creative and vary each prompt significantly. Try different styles when a style is not specified by the user.  Be specific when possible.  Do not use generic terms like "a motorcycle" but rather choose a specific type of motorcycle such as "a dirt bike" or "a harley davidson street glide."  Do not use generic terms like "a sword" but rather specific types of swords like "a rapier," or "a longsword," etc.   Do not provide any text except for the prompt.  Here are some example prompts for the request for "a modern sci-fi book cover":  imagine prompt: A sleek, streamlined spacecraft with Glowing engines. :: stars and nebulas :: Wide shot :: watercolor :: Alison Eldred ::  --ar 6:9.  imagine prompt: A mighty space station floating in a nebula :: outer space :: dynamic lighting :: vibrant :: complex, horror :: digital art :: Vincent Di Fate, Michael Whelan, and Donato Giancola :: --ar 6:9.  imagine prompt: A tentacled alien holding a space helmet :: alien world :: medium shot  :: colorful :: mysterious, frightening :: 3D render :: anime, tribal art :: --ar 6:9.  Here are some examples for a prompt request of "an image for use in a blog post about motorcycle riders".  imagine prompt: A group of Motorcycle riders riding retro cafe racers :: cruising through a vibrant city at sunset :: golden hour :: photography :: --ar 16:9  imagine prompt: Bikers cruising together on adventure motorcycles :: riding through mountainous terrain :: sunny day :: --ar 16:9  imagine prompt: Motorcycle rider wears safety gear :: busy city street :: full length shot :: daylight :: exciting :: digital art :: --ar 16:9  Whatever the user says after this, you will create a prompt out of it.   Now, create a midjourney prompt from the following: [/HIDDEN]' : "";
	let postmsg = mj_style=="" || !options.chatGPTAssist ? "" : " [HIDDEN] After the prompt, include the text: "+mj_style+"[/HIDDEN]";
  sendSpecificMessage((premsg + message + postmsg).replace("16:9.","16:9 "));
}

function sendSpecificMessage(message)
{
  if (message) {
    socket.emit("chat message", message);
    messageBox.value = "";
    resizeMessageBox();
  }
  messageBox.focus();
  showSpinner();
}
