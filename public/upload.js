const summarizeFolderBtn = document.getElementById("summarize-folder-btn");
const filesInput = document.getElementById("files");

summarizeFolderBtn.addEventListener("click", () => {
  filesInput.click();
});

const allowedExtensions = [".js",".txt",".cs",".py",".php",".html",".css",".cpp",".ejs",".java",".rb",".swift",".xml",".json",".yml"];
filesInput.addEventListener("change", (event) => {
  const files = event.target.files;
  const validFiles = [];
  
  for (const file of files) {
    const extension = file.name.substring(file.name.lastIndexOf("."));
    if (allowedExtensions.includes(extension) && 
        !file.name.toLowerCase().includes('test') && 
        !file.name.includes('node_modules')) {
      validFiles.push(file);
    }
  }

  if (validFiles.length > 0) {
    const formData = new FormData();
    for (const file of validFiles) {
      formData.append("files", file);
    }

    fetch("/upload", {
      method: "POST",
      body: formData,
    })
      .then((response) =>
        console.log("The files are uploaded:", response)
      )
      .catch((error) => console.error("Error:", error));
  } else {
    alert(
      "Invalid file type. We only accept " + allowedExtensions.join(", ") + " files."
    );
  }

  filesInput.value = ""; // Clear the input.
});