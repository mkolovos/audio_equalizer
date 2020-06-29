let audioBuffer = null
let currentTrackNumber = 0,
  playingBufferSources = []

function ab2str(buf) {
  return String.fromCharCode.apply(null, new Uint8Array(buf))
}

function AudioBufferSlice(buffer, begin, end, audioContext) {
  var error = null

  var duration = buffer.duration
  var channels = buffer.numberOfChannels
  var rate = buffer.sampleRate

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

  var startOffset = rate * begin
  var endOffset = rate * end
  var frameCount = endOffset - startOffset
  var newArrayBuffer

  try {
    newArrayBuffer = audioContext.createBuffer(
      channels,
      endOffset - startOffset,
      rate
    )
    var anotherArray = new Float32Array(frameCount)
    var offset = 0

    for (var channel = 0; channel < channels; channel++) {
      buffer.copyFromChannel(anotherArray, channel, startOffset)
      newArrayBuffer.copyToChannel(anotherArray, channel, offset)
    }
    return newArrayBuffer
  } catch (e) {
    error = e
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

function bufferToWave(audioBuffer) {
  //prerequisite: loaded libflac.js & available via variable Flac
  let buffer = audioBuffer.getChannelData(1);
  var flac_encoder,
    CHANNELS = audioBuffer.numberOfChannels,
    SAMPLERATE = audioBuffer.sampleRate,
    COMPRESSION = 5,
    BPS = 16,
    VERIFY = false,
    BLOCK_SIZE = 0,
    flac_ok = 1,
    USE_OGG = false;

  flac_encoder = Flac.create_libflac_encoder(SAMPLERATE, CHANNELS, BPS, COMPRESSION);

  if (flac_encoder == 0) {
    return;
  }

  let encBuffer = [], metaData;

  function write_callback_fn(encodedData /*Uint8Array*/, bytes, samples, current_frame) {
    encBuffer.push(encodedData);
  };

  function metadata_callback_fn(data) {
    metaData = data;
  }

  let status_encoder;

  if (!USE_OGG) {
    status_encoder = Flac.init_encoder_stream(flac_encoder,
      write_callback_fn,    //required callback(s)
      metadata_callback_fn  //optional callback(s)
    );
  } else {
    status_encoder = Flac.init_encoder_ogg_stream(flac_encoder,
      write_callback_fn,    //required callback(s)
      metadata_callback_fn  //optional callback(s)
    );
  }
  flac_ok &= (status_encoder == 0);

  var buf_length = buffer.length;
  var buffer_i32 = new Int32Array(buf_length);
  var view = new DataView(buffer_i32.buffer);
  var volume = 1.0;
  var index = 0;
  for (var i = 0; i < buf_length; i++) {
    view.setInt32(index, (buffer[i] * (0x7fff * volume)), true);
    index += 4;
  }
  var flac_return = Flac.FLAC__stream_encoder_process_interleaved(flac_encoder, buffer_i32, buf_length);
  if (flac_return != true) {
    console.log("Error: FLAC__stream_encoder_process_interleaved returned false. " + flac_return);
    return false;
  }

  flac_ok &= Flac.FLAC__stream_encoder_finish(flac_encoder);

  Flac.FLAC__stream_encoder_delete(flac_encoder);

  var blob = exportFlacFile(encBuffer, metaData);
  return blob;
}

async function modifyAudio(
  arrayBuffer,
  audioCtx,
  startTime,
  isNew,
  trackNumber
) {
  if (isNew) {
    currentTrackNumber = trackNumber
  }
  else if (trackNumber != currentTrackNumber) return

  let offset = startTime * 1024,
    length,
    buffer,
    result,
    sliceSize = 1024,
    time = startTime,
    volumes,
    enc = new TextEncoder()

  if (!audioBuffer) audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  length = audioBuffer.length

  {
    buffer = AudioBufferSlice(
      audioBuffer,
      offset,
      Math.min(offset + sliceSize),
      audioCtx
    )

    let file = bufferToWave(buffer)
    volumes = getCurrentVolumes()
    var fd = new FormData()
    fd.append("volumes", JSON.stringify(volumes))
    fd.append("file1", file)
    //Get readable stream of modified audio
    result = await fetch("http://localhost:8080/audio/server.php", {
      body: fd,
      method: "POST",
    })

    //Get file from readable stream.
    result = await result.arrayBuffer()

    //Decode from file
    result = await audioCtx.decodeAudioData(result)

    //Append modified buffer to audio context
    appendModifiedBuffer(audioCtx, result, time, isNew)

    time += buffer.duration
    offset = Math.min(offset + sliceSize, length)

    if (offset !== length) {
      setTimeout(() => {
        modifyAudio(null, audioCtx, offset / 1000, false, trackNumber)
      }, 300)
    } else {
      document.getElementById("controls-play").setAttribute("disabled", "true")
    }
  }
}

function appendModifiedBuffer(audioCtx, result, time, isNew) {
  let currentTime = audioCtx.currentTime,
    source = audioCtx.createBufferSource(),
    i

  if (isNew) {
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
}

