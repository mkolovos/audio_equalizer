let currentTrackNumber = 0, playingBufferSources = []

function ab2str(buf) {
  return String.fromCharCode.apply(null, new Uint8Array(buf))
}

function AudioBufferSlice(buffer, begin, end, audioContext) {
  let error = null, duration = buffer.duration, channels = buffer.numberOfChannels, rate = buffer.sampleRate

  if (typeof end === "function") {
    callback = end
    end = duration
  }

  // milliseconds to seconds
  begin = begin / 1000
  end = end / 1000

  if (begin < 0) {
    error = new RangeError("begin time must be greater than 0")
  }

  if (end > duration) {
    error = new RangeError("end time must be less than or equal to " + duration)
  }

  let startOffset = rate * begin, endOffset = rate * end, frameCount = endOffset - startOffset, newArrayBuffer

  try {
    newArrayBuffer = audioContext.createBuffer(
      channels,
      endOffset - startOffset,
      rate
    )
    let anotherArray = new Float32Array(frameCount), offset = 0

    for (let channel = 0; channel < channels; channel++) {
      buffer.copyFromChannel(anotherArray, channel, startOffset)
      newArrayBuffer.copyToChannel(anotherArray, channel, offset)
    }
    return newArrayBuffer
  } catch (e) {
    error = e
    console.log(error)
    return -1
  }
}

function getCurrentVolumes() {
  let volumes = [
    {
      start: 20,
      end: 60,
    },
    {
      start: 60,
      end: 250,
    },
    {
      start: 250,
      end: 500,
    },
    {
      start: 500,
      end: 2000,
    },
    {
      start: 2000,
      end: 4000,
    },
    {
      start: 4000,
      end: 6000,
    },
    {
      start: 6000,
      end: 20000,
    },
  ]

  return volumes.map(function (volume, index) {
    return {
      ...volume,
      gain: document.getElementById(`volume${index + 1}`).value,
    }
  })
}

function bufferToWave(abuffer, len) {
  let numOfChan = abuffer.numberOfChannels,
    length = len * numOfChan * 2 + 44,
    buffer = new ArrayBuffer(length),
    view = new DataView(buffer),
    channels = [],
    i,
    sample,
    offset = 0,
    pos = 0

  // write WAVE header
  setUint32(0x46464952) // "RIFF"
  setUint32(length - 8) // file length - 8
  setUint32(0x45564157) // "WAVE"

  setUint32(0x20746d66) // "fmt " chunk
  setUint32(16) // length = 16
  setUint16(1) // PCM (uncompressed)
  setUint16(numOfChan)
  setUint32(abuffer.sampleRate)
  setUint32(abuffer.sampleRate * 2 * numOfChan) // avg. bytes/sec
  setUint16(numOfChan * 2) // block-align
  setUint16(16) // 16-bit (hardcoded in this demo)

  setUint32(0x61746164) // "data" - chunk
  setUint32(length - pos - 4) // chunk length

  // write interleaved data
  for (i = 0; i < abuffer.numberOfChannels; i++)
    channels.push(abuffer.getChannelData(i))

  while (pos < length) {
    for (i = 0; i < numOfChan; i++) {
      // interleave channels
      sample = Math.max(-1, Math.min(1, channels[i][offset])) // clamp
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0 // scale to 16-bit signed int
      view.setInt16(pos, sample, true) // write 16-bit sample
      pos += 2
    }
    offset++ // next source sample
  }

  // create Blob
  return new Blob([buffer], { type: "audio/wav" })

  function setUint16(data) {
    view.setUint16(pos, data, true)
    pos += 2
  }

  function setUint32(data) {
    view.setUint32(pos, data, true)
    pos += 4
  }
}

async function modifyAudio(
  audioBuffer,
  audioCtx,
  startTime,
  isNew,
  trackNumber
) {
  if (isNew) trackNumber = ++currentTrackNumber
  else if (trackNumber != currentTrackNumber) return

  let offset,
    length,
    buffer,
    result,
    sliceSize = 1024,
    time = startTime,
    volumes

  offset = sliceSize * startTime;
  let enc = new TextEncoder()
  length = audioBuffer.duration

  {
    buffer = AudioBufferSlice(
      audioBuffer,
      offset,
      offset + sliceSize,
      audioCtx
    )

    let file = bufferToWave(buffer, buffer.length)
    volumes = getCurrentVolumes()
    let fd = new FormData()
    fd.append("volumes", JSON.stringify(volumes))
    fd.append("file1", file)
    //Get readable stream of modified audio
    result = await fetch("server.php", {
      body: fd,
      method: "POST",
    })

    //Get file from readable stream.
    result = await result.arrayBuffer()

    //Decode from file
    result = await audioCtx.decodeAudioData(result)

    //Append modified buffer to audio context
    appendModifiedBuffer(audioCtx, result, time, isNew)

    time = Math.min(time + buffer.duration, length);
    offset = offset + sliceSize

    if (time !== length) {
      setTimeout(() => {
        modifyAudio(audioBuffer, audioCtx, offset / sliceSize, false, trackNumber)
      }, 300)
    } else {
      audioBuffer = null
    }
  }
}

function appendModifiedBuffer(audioCtx, result, time, isNew) {
  let currentTime = audioCtx.currentTime,
    source = audioCtx.createBufferSource(),
    i

  if (isNew) {
    if (playingBufferSources.length)
      for (i = 0; i < playingBufferSources.length; i++) {
        playingBufferSources[i].source.stop()
      }
    playingBufferSources = []
  } else {
    for (i = 0; i < playingBufferSources.length; i++) {
      if (playingBufferSources[i].endTime <= currentTime) {
        playingBufferSources[i].source.stop()
      }
    }

    playingBufferSources = playingBufferSources.filter(function (source) {
      return source.endTime > currentTime
    })
  }

  if (currentTime > time) {
    source.buffer = result
    source.connect(audioCtx.destination)
    source.start(currentTime, currentTime - time)
  } else {
    source.buffer = result
    source.connect(audioCtx.destination)
    source.start(time)
  }
  playingBufferSources.push({ endTime: time + result.duration, source: source })
  if (audioCtx.state === "suspended") {
    audioCtx.resume()
  }
}