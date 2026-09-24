$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$audioRoot = Join-Path $PSScriptRoot '../backend/app/static/assets/aviation/audio/paired-v1'
New-Item -ItemType Directory -Path $audioRoot -Force | Out-Null
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speaker.SelectVoice('Microsoft Huihui Desktop')
$speaker.Volume = 100
$speaker.Rate = 2
$content = Get-Content (Join-Path $PSScriptRoot '../backend/app/static/assets/aviation/content.json') -Raw | ConvertFrom-Json
foreach ($q in $content.question_types) {
  $file = ($q.audio_url.Split('/')[-1]).Split('?')[0]
  $speaker.SetOutputToWaveFile((Join-Path $audioRoot $file))
  # 题目语音只读题干；选项由用户自行阅读，避免播报过长拖慢自定节奏。
  $speaker.Speak($q.question)
  $speaker.SetOutputToNull()
}
$speaker.Rate = 0
$guides = @{
  'practice-complete'='三道预训练已完成。接下来连续采集六十秒，请保持面部在屏幕上方的取景范围内。准备好后，点击开始正式测评。'
  'practice-skipped'='已跳过预训练。准备好后，请点击开始正式测评。'
  'start'='正式测评即将开始。'
  'countdown-3'='三。'
  'countdown-2'='二。'
  'countdown-1'='一。'
  'closing'='答题已结束，请继续看向屏幕，直到六十秒采集完成。'
  'complete'='采集完成，正在保存本次测评数据。'
  'invalid'='本次采集已中断。请将面部移回画面中央，重新就位后开始。'
  'deviation'='请将面部移到画面中央。'
  'near'='距离过近，请稍微向后坐。'
  'far'='请向屏幕靠近一点。'
}
foreach ($entry in $guides.GetEnumerator()) {
  $speaker.SetOutputToWaveFile((Join-Path $audioRoot ($entry.Key+'.wav')))
  $speaker.Speak($entry.Value)
  $speaker.SetOutputToNull()
}
$speaker.Dispose()
Write-Output ('Generated '+$content.question_types.Count+' question prompts and '+$guides.Count+' guidance prompts.')
