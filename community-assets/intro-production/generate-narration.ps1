$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$zhVoice = $voice.GetInstalledVoices() | Where-Object {$_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'zh-CN'} | Select-Object -First 1
if ($null -eq $zhVoice) { throw '没有可用的中文语音引擎' }
$voice.SelectVoice($zhVoice.VoiceInfo.Name)
$voice.Rate = -1
$voice.Volume = 100
$output = Join-Path $PSScriptRoot 'public\audio\narration.wav'
$voice.SetOutputToWaveFile($output)
$text = '每天，我们忙着工作、照顾家人、安排生活。你有多久，没有问问自己：最近过得怎么样？开心、紧张、疲惫，都是生活里常有的感受。心理健康，是能留意自己的变化，照顾自己的需要。就像关心睡眠和身体一样，我们也可以关心自己的情绪、精力，以及和他人相处时的感受。留一点时间做喜欢的事，和信任的人聊一聊。如果困扰持续影响生活，也可以寻求专业支持。现在，请花几分钟了解此刻的状态。先看操作示范，再跟随语音和画面，按照真实感受选择。这不是考试，没有标准答案。测评用于了解当前状态，不代替专业诊断。准备好，我们就开始。'
$voice.Speak($text)
$voice.Dispose()
