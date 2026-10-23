(() => {
  const $ = (selector) => document.querySelector(selector);
  const tabs = [...document.querySelectorAll(".tool-tab")];
  const input = $("#image-input");
  const dropZone = $("#drop-zone");
  const workspace = $("#workspace");
  const fileName = $("#file-name");
  const fileDetails = $("#file-details");
  const fileThumb = $("#file-thumb");
  const quality = $("#quality");
  const qualityValue = $("#quality-value");
  const widthInput = $("#width-input");
  const heightInput = $("#height-input");
  const keepRatio = $("#keep-ratio");
  const formatSelect = $("#format-select");
  const processButton = $("#process-button");
  const downloadButton = $("#download-button");
  const resultBox = $("#result-box");
  const resultTitle = $("#result-title");
  const resultDetails = $("#result-details");
  const resultBadge = $("#result-badge");
  const errorMessage = $("#error-message");

  let mode = "compress";
  let selectedFile = null;
  let sourceImage = null;
  let outputBlob = null;
  let outputName = "snaptools-image.webp";
  let originalWidth = 0;
  let originalHeight = 0;
  let thumbUrl = null;

  $("#year").textContent = new Date().getFullYear();

  const formatBytes = (bytes) => {
    if (!Number.isFinite(bytes)) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const showError = (message) => {
    errorMessage.textContent = message;
    errorMessage.classList.remove("hidden");
  };
  const clearError = () => {
    errorMessage.textContent = "";
    errorMessage.classList.add("hidden");
  };
  const clearResult = () => {
    outputBlob = null;
    downloadButton.classList.add("hidden");
    resultBox.classList.add("hidden");
  };

  function setMode(nextMode) {
    mode = nextMode;
    tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.mode === mode));
    $("#compress-settings").classList.toggle("hidden", mode !== "compress");
    $("#resize-settings").classList.toggle("hidden", mode !== "resize");
    $("#convert-settings").classList.toggle("hidden", mode !== "convert");
    const content = {
      compress: ["Compress your image", "Make your image file smaller while keeping it looking good."],
      resize: ["Resize your image", "Set new dimensions while optionally preserving proportions."],
      convert: ["Convert image format", "Save your image as WebP, JPG or PNG."]
    }[mode];
    $("#tool-title").textContent = content[0];
    $("#tool-description").textContent = content[1];
    processButton.innerHTML = `${mode === "compress" ? "Compress image" : mode === "resize" ? "Resize image" : "Convert image"} <span aria-hidden="true">→</span>`;
    clearError();
    clearResult();
  }

  tabs.forEach((tab) => tab.addEventListener("click", () => setMode(tab.dataset.mode)));
  quality.addEventListener("input", () => {
    qualityValue.textContent = `${quality.value}%`;
    clearResult();
  });
  formatSelect.addEventListener("change", clearResult);
  [widthInput, heightInput, keepRatio].forEach((el) => {
    el.addEventListener("input", () => {
      if (!sourceImage || mode !== "resize" || !keepRatio.checked) { clearResult(); return; }
      if (el === widthInput && widthInput.value) heightInput.value = Math.max(1, Math.round(Number(widthInput.value) * originalHeight / originalWidth));
      if (el === heightInput && heightInput.value) widthInput.value = Math.max(1, Math.round(Number(heightInput.value) * originalWidth / originalHeight));
      clearResult();
    });
  });

  function loadFile(file) {
    clearError();
    clearResult();
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showError("Please choose a valid image file.");
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      showError("This starter version supports images up to 30 MB. Please choose a smaller file.");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
      thumbUrl = url;
      selectedFile = file;
      sourceImage = img;
      originalWidth = img.naturalWidth;
      originalHeight = img.naturalHeight;
      fileName.textContent = file.name;
      fileDetails.textContent = `${originalWidth} × ${originalHeight} px · ${formatBytes(file.size)}`;
      fileThumb.style.backgroundImage = `url("${url}")`;
      fileThumb.textContent = "";
      widthInput.value = originalWidth;
      heightInput.value = originalHeight;
      dropZone.classList.add("hidden");
      workspace.classList.remove("hidden");
      processButton.disabled = false;
      processButton.style.opacity = "1";
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      showError("This image could not be opened. Try a JPG, PNG or WebP image.");
    };
    img.src = url;
  }

  input.addEventListener("change", (event) => loadFile(event.target.files[0]));
  $("#remove-image").addEventListener("click", () => {
    selectedFile = null;
    sourceImage = null;
    input.value = "";
    workspace.classList.add("hidden");
    dropZone.classList.remove("hidden");
    fileThumb.style.backgroundImage = "";
    fileThumb.textContent = "IMG";
    clearError();
    clearResult();
    if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    thumbUrl = null;
  });

  ["dragenter", "dragover"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragover");
  }));
  ["dragleave", "drop"].forEach((eventName) => dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragover");
  }));
  dropZone.addEventListener("drop", (event) => loadFile(event.dataTransfer.files[0]));

  function canvasToBlob(canvas, type, qualityValue) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, qualityValue));
  }

  async function processImage() {
    clearError();
    clearResult();
    if (!selectedFile || !sourceImage) {
      showError("Choose an image first.");
      return;
    }

    processButton.disabled = true;
    processButton.innerHTML = "Processing…";
    try {
      let width = originalWidth;
      let height = originalHeight;
      let type = "image/webp";
      let q = Number(quality.value) / 100;

      if (mode === "resize") {
        width = Number(widthInput.value);
        height = Number(heightInput.value);
        if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 12000 || height > 12000) {
          throw new Error("Enter a width and height between 1 and 12,000 pixels.");
        }
      }
      if (mode === "convert") {
        type = formatSelect.value;
        q = 0.92;
      }
      if (mode === "compress") {
        // WebP is a useful default for smaller files; transparency is preserved.
        type = selectedFile.type === "image/png" ? "image/webp" : "image/webp";
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: type !== "image/jpeg" });
      if (!context) throw new Error("Your browser could not start image processing.");
      if (type === "image/jpeg") {
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
      }
      context.drawImage(sourceImage, 0, 0, width, height);
      const blob = await canvasToBlob(canvas, type, q);
      if (!blob) throw new Error("This format could not be created by your browser. Try WebP or JPG.");
      if (blob.type !== type && type === "image/webp") {
        throw new Error("WebP conversion is not supported by this browser. Try the JPG option in Convert format.");
      }

      outputBlob = blob;
      const extension = type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : "webp";
      const baseName = selectedFile.name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-") || "image";
      outputName = `${baseName}-snaptools.${extension}`;
      const delta = selectedFile.size - blob.size;
      const percentage = selectedFile.size ? Math.round((delta / selectedFile.size) * 100) : 0;
      resultTitle.textContent = "Your image is ready";
      resultDetails.textContent = `${width} × ${height} px · ${formatBytes(blob.size)}${delta > 0 ? ` · ${percentage}% smaller` : delta < 0 ? ` · ${Math.abs(percentage)}% larger` : " · same file size"}`;
      resultBadge.textContent = "READY";
      resultBox.classList.remove("hidden");
      downloadButton.classList.remove("hidden");
      downloadButton.textContent = `Download ${extension.toUpperCase()} ↓`;
    } catch (error) {
      showError(error.message || "Something went wrong. Please try another image.");
    } finally {
      processButton.disabled = false;
      processButton.innerHTML = `${mode === "compress" ? "Compress image" : mode === "resize" ? "Resize image" : "Convert image"} <span aria-hidden="true">→</span>`;
    }
  }

  processButton.addEventListener("click", processImage);
  downloadButton.addEventListener("click", () => {
    if (!outputBlob) return;
    const url = URL.createObjectURL(outputBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = outputName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
})();
