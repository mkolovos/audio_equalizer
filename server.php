<?php
  require 'vendor/autoload.php';

  $path = "uploads/"; //file to place within the server
  $valid_formats1 = array("mp3", "ogg", "flac"); //list of file extention to be accepted
  $ffmpeg = FFMpeg\FFMpeg::create([
    'ffmpeg.binaries'  => 'ffmpeg_bin/ffmpeg',
    'ffprobe.binaries' => 'ffmpeg_bin/ffprobe'
  ]);

  ini_set('display_startup_errors',1);
  ini_set('display_errors',1);
  error_reporting(-1);

  if(isset($_POST) and $_SERVER['REQUEST_METHOD'] == "POST")
  {
    $file1 = $_FILES['file1']['name']; //input file name in this code is file1
    $size = $_FILES['file1']['size'];

    if(strlen($file1))
    {
      $actual_file_name = $file1;
      $tmp = $_FILES['file1']['tmp_name'];
      $uploadedPath = __DIR__.'/uploads/'.$actual_file_name.".flac";

      if(move_uploaded_file($tmp, $uploadedPath))
      {
        $audio = $ffmpeg->open($uploadedPath);
        $volumes = json_decode($_POST['volumes']);
        $command = "";

        for ($i = 0; $i < count($volumes); $i ++) {
          if ($i > 0) $command = $command.",";
          $command = $command.sprintf("equalizer=f=%f:t=h:width=%f:g=%f", ($volumes[$i]->start + $volumes[$i]->end) / 2, ($volumes[$i]->end - $volumes[$i]->start) / 2, $volumes[$i]->gain);
        }
        $audio->filters()->custom($command);
        
        $format = new FFMpeg\Format\Audio\Flac();
        $filepath = sprintf(__DIR__.'/uploads/'."edited_%s.flac", $actual_file_name);
        $audio->save($format, $filepath);

        header('Content-Description: File Transfer');
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="'.basename($filepath).'"');
        header('Expires: 0');
        header('Cache-Control: must-revalidate');
        header('Pragma: public');
        header('Content-Length: ' . filesize($filepath));
        flush(); // Flush system output buffer
        readfile($filepath);
      }
      else
          echo "failed";
    }
  }
?>