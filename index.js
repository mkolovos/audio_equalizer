const fileInput = document.getElementById("data-source")
const playButton = document.getElementById("controls-play")

let audioCtx, audioBufferSource, audioElement, bufferSource

audioElement = document.createElement("audio")

if (!fileInput.value) playButton.setAttribute("disabled", "true")
fileInput.addEventListener("input", function (e) {
  const audioFile = fileInput.files[0]
  if (!audioCtx) {
    init()
  }
  audioFile.arrayBuffer().then(function (arrayBuffer) {
    audioCtx.decodeAudioData(arrayBuffer).then(function (audioBuffer) {
      bufferSource = audioBuffer;
      playButton.disabled = false
    })
  })
})

playButton.addEventListener("click", function () {
  modifyAudio(bufferSource, audioCtx, 0, true)
  document.getElementById("controls-play").setAttribute("disabled", "true")
})

audioElement.addEventListener("ended", () => {
  playButton.dataset.playing = "false"
})

function init() {
  audioCtx = new AudioContext()
  audioCtx.suspend()
}

function changeVolumeforFrequency(element, elementId) {
  document.getElementById(elementId).value = element.value
  if (bufferSource && bufferSource.duration > audioCtx.currentTime) {
    modifyAudio(bufferSource, audioCtx, audioCtx.currentTime, true)
  }
}

function getFileName(fullPath) {
  if (fullPath) {
    var startIndex =
      fullPath.indexOf("\\") >= 0
        ? fullPath.lastIndexOf("\\")
        : fullPath.lastIndexOf("/")
    var filename = fullPath.substring(startIndex)
    if (filename.indexOf("\\") === 0 || filename.indexOf("/") === 0) {
      filename = filename.substring(1)
    }
    return filename
  }
}

async function handleClickDownload() {
  const audioFile = fileInput.files[0]
  if (!audioFile) {
    alert("Please choose audio file!")
    return;
  }
  var fd = new FormData()
  fd.append("file1", audioFile)
  fd.append("volumes", JSON.stringify(getCurrentVolumes()))
  //Implement Pause
  result = await fetch("download.php", {
    body: fd,
    method: "POST",
  })

  result = await result.blob()
  var a = document.createElement("a")
  var url = URL.createObjectURL(result)
  a.href = url
  a.download = `edited_${getFileName(fileInput.value)}`
  document.body.append(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}
