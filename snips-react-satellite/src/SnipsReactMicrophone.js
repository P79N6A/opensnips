import React, { Component } from 'react'
//import AudioMeter from './AudioMeter.react'
import SnipsReactComponent from './SnipsReactComponent'
//let hark = require('hark');

export default class SnipsReactMicrophone extends SnipsReactComponent  {

    constructor(props) {
        super(props);
        let that = this;
        this.state={}
        if (!props.siteId || props.siteId.length === 0) {
            throw "Snips Microphone must be configured with a siteId property";
        }
        //this.audioBuffer=[]
        this.state={recording:false,messages:[],lastIntent:'',lastTts:'',lastTranscript:'',showMessage:false,activated:false,speaking:false,showConfig:false,listening:false,sessionId : ""}
        this.siteId = props.siteId ? props.siteId : 'browser'+parseInt(Math.random()*100000000,10);
        this.clientId = props.clientId ? props.clientId :  'client'+parseInt(Math.random()*100000000,10);
        this.hotwordId = props.hotwordId ? props.hotwordId :  'default';
        this.context = null;
        this.inputGainNodes = [];
        this.messageTimeout = null;
        this.speakingTimeout = null;
        this.speechEvents =  null;
        this.startRecording = this.startRecording.bind(this);
        this.stopRecording = this.stopRecording.bind(this);
        this.startRecorder = this.startRecorder.bind(this);
        this.sendAudioBuffer = this.sendAudioBuffer.bind(this);
        this.audioBufferToWav = this.audioBufferToWav.bind(this);
        this.reSample = this.reSample.bind(this);
        this.encodeWAV = this.encodeWAV.bind(this);
        this.interleave = this.interleave.bind(this);
        this.flashState = this.flashState.bind(this);
        this.activate = this.activate.bind(this);
        this.deactivate = this.deactivate.bind(this);
        this.waitingForSession = null;
        
        
        let eventFunctions = {
        // SESSION
            //'hermes/dialogueManager/sessionStarted' : function(payload) {
                //console.log(['SESSION STARTED',payload,payload.siteId,that.siteId ,payload.customData]);
                //if (payload.siteId && payload.siteId.length > 0 && payload.siteId === that.siteId ) {
                    //console.log(['SESSION STARTED MATCH SITE'])
                    //that.setState({sending : true});
                    ////try {
                        ////let customData = JSON.parse(payload.customData);
                        ////console.log(['SESSION STARTED PARSE CUSTM DATA']);
                        ////if (customData.startedBy === "snipsmicrophone") {
                            ////console.log(['SESSION STARTED SEND START LISTENING']);
                            ////that.sendMqtt('hermes/asr/startListening',{siteId:payload.siteId,sessionId:payload.sessionId});
                        ////}
                    ////} catch (e) {
                        ////// no custom data
                    ////}
                ////}
            //},
            'hermes/asr/textCaptured' : function(payload) {
                if (payload.siteId && payload.siteId.length > 0 && payload.siteId === that.siteId && payload.text && payload.text.length > 0 ) {
                    that.flashState('lastTranscript',payload.text);
                }
            },
            'hermes/tts/say' : function(payload) {
                if (payload.siteId && payload.siteId.length > 0 && payload.siteId === that.siteId && payload.text && payload.text.length > 0 ) {
                    that.flashState('lastTts',payload.text);
                }
            },
            'hermes/hotword/#/toggleOn' : function(payload) {
                if (that.props.enableServerHotword) {
                    if (payload.siteId && payload.siteId.length > 0 && payload.siteId === that.siteId) {
                        that.setState({sending : true});
                    }
                }
            },
            'hermes/hotword/#/toggleOff' : function(payload) {
                if (that.props.enableServerHotword) {
                    if (payload.siteId && payload.siteId.length > 0 && payload.siteId === that.siteId) {
                      //  console.log(['MIC STOP LISTENING']);
                        that.setState({sending : false});
                    }                    
                }
            },
            'hermes/asr/startListening' : function(payload) {
                //console.log(['MIC STart LISTENING',that.siteId,payload.siteId,payload.text]);
                    
                if (payload.siteId && payload.siteId.length > 0 && payload.siteId === that.siteId ) {
                    //console.log(['MIC STart LISTENING',that.siteId,payload.siteId,payload.text]);
                    that.setState({sending : true});
                }
            },
            'hermes/asr/stopListening' : function(payload) {
                if (payload.siteId && payload.siteId.length > 0 && payload.siteId === that.siteId ) {
                    //console.log(['MIC STOP LISTENING']);
                    that.setState({sending : false});
                }
            }
        }
        
        this.logger = this.connectToLogger(props.logger,eventFunctions);
    }  
    
  
    /**
     * Lifecycle functions
     */
     
    /**
     * Activate on mount if user has previously enabled.
     */ 
    componentDidMount() {
        // if previously activated, restore microphone
        this.startRecorder();
        let that = this;
        // TODO START AT BOOT
        //this.sendAsrStopListening(this.props.siteId);
        //this.sendAsrToggleOff();
        //this.sendAsrToggleOn();
        this.sendStartSession(this.props.siteId);
        setTimeout(function() {
            console.log('timeout end session');
            that.sendEndSession(that.props.siteId);
            if (localStorage.getItem(that.appendUserId('snipsmicrophone_enabled',that.props.user)) === 'true') {
                that.activate(false);
            }
        },1000);
        
        
    }
    
    showConfig() {
        
    };
    showConfigNow() {
        
    };
    clearConfigTimer() {
        
    };
  
    
    /**
     * Connect to mqtt, start the recorder and optionally start listening
     * Triggered by microphone click or hotword when the mic is deactivated
     */
    activate(start = true) {
        //console.log(['MIC ACTIVATE',start]);
        let that = this;
        localStorage.setItem(this.appendUserId('snipsmicrophone_enabled',this.props.user),'true');
        if (start) {
            setTimeout(function() {
                //this.sendEndSession.bind(this)(this.siteId);
                //this.sendStartSession.bind(this)(this.siteId);
                that.startRecording();
            },500);  
        }
        that.setState({activated:true,sending:false});
    };
    
    
    /**
     * Enable streaming of the audio input stream
     */ 
    startRecording = function() {
       //console.log(['MIC START REC']);
        this.setState({lastIntent:'',lastTts:'',lastTranscript:'',showMessage:false});
        // TODO START AT BOOT
        this.sendAsrToggleOn();
        this.sendStartSession(this.siteId,{startedBy:'snipsmicrophone',user:this.props.user ? this.props.user._id : ''});
        //this.sendHotwordDetected(this.hotwordId,this.siteId);
    }
    
    /**
     * Disable microphone and listeners
     */
    deactivate() {
       // console.log(['MIC DEACTIV']);
        //console.log(['deactivate',this.mqttClient]);
        localStorage.setItem(this.appendUserId('snipsmicrophone_enabled',this.props.user),'false');
        this.setState({activated:false,sending:false});
    };

   
     /**
     * Access the microphone and start streaming mqtt packets
     */ 
    startRecorder() {
       console.log('MIC START RECORDER');
        let that = this;
        if (!navigator.getUserMedia) {
            navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia ||
        navigator.mozGetUserMedia || navigator.msGetUserMedia;
        }
         try {
           // console.log(['MIC START RECORDER',navigator,navigator ? navigator.getUserMedia : 'NULL']);
            if (navigator.getUserMedia) {
             //   console.log(['MIC START RECORDER have usermedia']);
              navigator.getUserMedia({audio:true}, success, function(e) {
                console.log(['MIC Error capturing audio.',e]);
              });
              //console.log(['MIC START RECORDER after have usermedia']);
            } else {
                console.log('MIC getUserMedia not supported in this browser.');
            }
             
         }   catch (e) {
             console.log(e);
         }
        
        function success(e) {
           //console.log('MIC STARTING');
           let audioContext = window.AudioContext || window.webkitAudioContext;
           let context = new audioContext();
            that.setState({'activated':true});
           
           // that.bindSpeakingEvents.bind(that)(context,e);
            // start media streaming mqtt
           //console.log(['SET CONTEXT',context]);
          
          let gainNode = context.createGain();
          // initial set volume
          gainNode.gain.value = 0.9; // that.state.config.inputvolume > 0 ? that.state.config.inputvolume/100 : 0.5;
          let audioInput = context.createMediaStreamSource(e);
          var bufferSize = 256;
          let recorder = context.createScriptProcessor(bufferSize, 1, 1);
          recorder.onaudioprocess = function(e){
            //!that.logger.connected || 
            if(!that.state.sending) return;
            var left = e.inputBuffer.getChannelData(0);
            that.sendAudioBuffer(e.inputBuffer,context.sampleRate); 
            console.log('MIC send audio'); //,buffer,that.audioBuffer]);
            //that.audioBuffer.push(new Float32Array(e.inputBuffer.getChannelData(0)));
            //that.recordingLength += bufferSize;
          }
        that.addInputGainNode(gainNode) ;
        audioInput.connect(gainNode)
        gainNode.connect(recorder);
        //audioInput.connect(recorder)
        // TODO, is this required?
        recorder.connect(context.destination); 
        //that.sendHotwordToggleOn.bind(that)(that.siteId);
       // console.log('MIC STARTED');
        }
    };
 
    

    

    stopRecording = function() {
       // console.log(['STOP REC']);
        //this.setState({sending : false});
        let session = this.logger.getSession(this.siteId,null);
        if (session) this.sendEndSession(session.sessionId);
       
      
    }
    
    
        
    addInputGainNode(node) {
        this.inputGainNodes.push(node);
    };
    
    
    appendUserId(text,user) {
        if (user && user._id) {
            return text+"_"+user._id;
        } else {
            return text;
        }
    };
   
  
    
    ///**
     //* Bind silence recognition events to set speaking state
     //*/ 
    //bindSpeakingEvents(audioContext,e) {
       //// console.log(['bindSpeakingEvents'])
        //let that = this;
        //var options = {audioContext:audioContext};
        //options.threshhold = this.getThreshholdFromVolume(this.state.config.silencesensitivity);
        //// bind speaking events care of hark
            //this.speechEvents = hark(e, options);
            //this.speechEvents.on('speaking', function() {
              //if (that.state.config.silencedetection !== "no") {
                  ////console.log('speaking');
                  //if (that.speakingTimeout) clearTimeout(that.speakingTimeout);
                  //that.setState({speaking:true});
                //}
            //});
            
            //this.speechEvents.on('stopped_speaking', function() {
                //if (that.state.config.silencedetection !== "no") {
                  //if (that.speakingTimeout) clearTimeout(that.speakingTimeout);
                  //that.speakingTimeout = setTimeout(function() {
                     //// console.log('stop speaking');
                     //that.setState({speaking:false});
                  //},1000);
                //}
              
            //});            
        
    //};

    //getThreshholdFromVolume(volume) {
        //return 10 * Math.log((101 - volume )/800);
    //};

   
    
   flashState(key,value) {
       let that = this;
       if (key && key.length > 0 && value && value.length > 0) {
           if (this.messageTimeOut) clearTimeout(this.messageTimeOut);
           let newObj = {showMessage:true};
           if (key === "lastTranscript") {
               newObj.lastIntent='';
               newObj.lastTts='';
           }
           newObj[key] = value;
           this.setState(newObj);
           setTimeout(function() {
               that.setState({showMessage:false});
           },that.props.messageTimeout > 0 ? that.props.messageTimeout : 10000);           
       }

   };
    
    
    /** WAV encoding functions */
    sendAudioBuffer(buffer,sampleRate) {
         let that = this;
         //this.audioBuffer
        if (buffer) {
           this.reSample(buffer,16000,function(result) {
               let wav = that.audioBufferToWav(result) ;
               that.logger.sendAudioMqtt("hermes/audioServer/"+that.siteId+"/audioFrame",wav);
               //console.log('send audio',that.siteId,wav);          
            },sampleRate);
        }
        
    };
     
    convertFloat32ToInt16(buffer) {
      let l = buffer.length;
      let buf = new Int16Array(l);
      while (l--) {
        buf[l] = Math.min(1, buffer[l])*0x7FFF;
      }
      return buf.buffer;
    } 
     
    flattenArray(inChannelBuffer, recordingLength) {
        let channelBuffer = this.convertFloat32ToInt16(inChannelBuffer);
        
        var result = new Float32Array(recordingLength);
        var offset = 0;
        for (var i = 0; i < channelBuffer.length; i++) {
            var buffer = channelBuffer[i];
            result.set(buffer, offset);
            offset += buffer.length;
        }
        return result;
    } 
     
     
    reSample(audioBuffer, targetSampleRate, onComplete,sampleRateContext) {
        let sampleRate =  !isNaN(sampleRateContext) ? sampleRateContext : 44100;
        var channel = audioBuffer && audioBuffer.numberOfChannels ? audioBuffer.numberOfChannels : 1;
        var samples = audioBuffer.length * targetSampleRate / sampleRate;
        var offlineContext = new OfflineAudioContext(channel, samples, targetSampleRate);
        var bufferSource = offlineContext.createBufferSource();
        bufferSource.buffer = audioBuffer;

        bufferSource.connect(offlineContext.destination);
        bufferSource.start(0);
        offlineContext.startRendering().then(function(renderedBuffer){
            onComplete(renderedBuffer);
        }).catch(function(e) {
            console.log(e);
        })
    }
    
    
    audioBufferToWav (buffer, opt) {
      opt = opt || {}

      var numChannels = buffer.numberOfChannels
      var sampleRate = buffer.sampleRate
      var format = opt.float32 ? 3 : 1
      var bitDepth = format === 3 ? 32 : 16

      var result
      if (numChannels === 2) {
        result = this.interleave(buffer.getChannelData(0), buffer.getChannelData(1))
      } else {
        result = buffer.getChannelData(0)
      }

      return this.encodeWAV(result, format, sampleRate, numChannels, bitDepth)
    }

    encodeWAV (samples, format, sampleRate, numChannels, bitDepth) {
      var bytesPerSample = bitDepth / 8
      var blockAlign = numChannels * bytesPerSample

      var buffer = new ArrayBuffer(44 + samples.length * bytesPerSample)
      var view = new DataView(buffer)

      /* RIFF identifier */
      this.writeString(view, 0, 'RIFF')
      /* RIFF chunk length */
      view.setUint32(4, 36 + samples.length * bytesPerSample, true)
      /* RIFF type */
      this.writeString(view, 8, 'WAVE')
      /* format chunk identifier */
      this.writeString(view, 12, 'fmt ')
      /* format chunk length */
      view.setUint32(16, 16, true)
      /* sample format (raw) */
      view.setUint16(20, format, true)
      /* channel count */
      view.setUint16(22, numChannels, true)
      /* sample rate */
      view.setUint32(24, sampleRate, true)
      /* byte rate (sample rate * block align) */
      view.setUint32(28, sampleRate * blockAlign, true)
      /* block align (channel count * bytes per sample) */
      view.setUint16(32, blockAlign, true)
      /* bits per sample */
      view.setUint16(34, bitDepth, true)
      /* data chunk identifier */
      this.writeString(view, 36, 'data')
      /* data chunk length */
      view.setUint32(40, samples.length * bytesPerSample, true)
      if (format === 1) { // Raw PCM
        this.floatTo16BitPCM(view, 44, samples)
      } else {
        this.writeFloat32(view, 44, samples)
      }

      return buffer
    }

    interleave (inputL, inputR) {
      var length = inputL.length + inputR.length
      var result = new Float32Array(length)

      var index = 0
      var inputIndex = 0

      while (index < length) {
        result[index++] = inputL[inputIndex]
        result[index++] = inputR[inputIndex]
        inputIndex++
      }
      return result
    }

    writeFloat32 (output, offset, input) {
      for (var i = 0; i < input.length; i++, offset += 4) {
        output.setFloat32(offset, input[i], true)
      }
    }

    floatTo16BitPCM (output, offset, input) {
      for (var i = 0; i < input.length; i++, offset += 2) {
        var s = Math.max(-1, Math.min(1, input[i]))
        output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
      }
    }

    writeString (view, offset, string) {
      for (var i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i))
      }
    }



    
    
  render() {
      let that = this;
    const {
      text
    } = this.props
    
    let buttonStyle=this.props.buttonStyle ? this.props.buttonStyle : {};
    let speechBubbleSettings= {};
    let speechBubbleCSS= {};
    
    let size= this.props.size && this.props.size.length > 0 ? this.props.size : '2em';
    buttonStyle.width = size
    buttonStyle.height = size
    
    let position = this.props.position && this.props.position.length > 0 ? this.props.position : 'topright';
    // set mic position and override bubble position
    buttonStyle.position = 'fixed';
    speechBubbleSettings.size ='20'
    if (position === "topleft") {
        buttonStyle.top = 0;
        buttonStyle.left = 0;
        speechBubbleSettings.triangle="top";
        speechBubbleSettings.side="right";
    } else if (position === "topright") {
        buttonStyle.top = 0;
        buttonStyle.right = 0;
        speechBubbleSettings.triangle="bottom";
        speechBubbleSettings.side="left";
    } else if (position === "bottomleft") {
        buttonStyle.bottom = 0;
        buttonStyle.left = 0;
        speechBubbleSettings.triangle="top";
        speechBubbleSettings.side="right";
    } else if (position === "bottomright") {
        buttonStyle.bottom = 0;
        buttonStyle.right = 0;
        speechBubbleSettings.triangle="bottom";
        speechBubbleSettings.side="left";
    }
    speechBubbleSettings.color="blue"
    
    let status = 0;
    if (this.state.activated) status = 2;
    //if (this.state.connected) status = 2;
    if (this.state.sending) status = 3;
    //if (this.state.sending) status = 3;
   // console.log(status);
    let borderColor='black'
    let borderWidth = 2;
    if (status==3) {
        borderColor = (this.state.speaking) ? 'darkgreen' : (this.props.borderColor ? this.props.borderColor : 'green');
        buttonStyle.backgroundColor = 'lightgreen';
        if (this.state.speaking) borderWidth = 3;
    } else if (status==1) {
        borderColor = (this.state.speaking) ? 'darkorange' : (this.props.borderColor ? this.props.borderColor : 'orange')
        buttonStyle.backgroundColor = 'lightorange';
        if (this.state.speaking) borderWidth = 3;
    } else if (status==2) {
        borderColor = (this.state.speaking) ? 'orangered' : (this.props.borderColor ? this.props.borderColor : 'red');
        buttonStyle.backgroundColor = 'pink';
        if (this.state.speaking) borderWidth = 3;
    } else {
        borderColor = this.props.borderColor ? this.props.borderColor : 'black';
        buttonStyle.backgroundColor =  'lightgrey';
    }
    if (!buttonStyle.padding) buttonStyle.padding = '0.5em';
    if (!buttonStyle.margin) buttonStyle.margin = '0.5em';
   // console.log(borderColor);
    //if (!buttonStyle.border) 
    buttonStyle.border = borderWidth + 'px solid '+borderColor;
    if (!buttonStyle.borderRadius) buttonStyle.borderRadius = '100px';
   // console.log(['BUTTON STYLE',buttonStyle]);
    
    let micOffIcon =  <svg style={buttonStyle}  aria-hidden="true" data-prefix="fas" data-icon="microphone" className="svg-inline--fa fa-microphone fa-w-11" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 352 512"><path fill="currentColor" d="M176 352c53.02 0 96-42.98 96-96V96c0-53.02-42.98-96-96-96S80 42.98 80 96v160c0 53.02 42.98 96 96 96zm160-160h-16c-8.84 0-16 7.16-16 16v48c0 74.8-64.49 134.82-140.79 127.38C96.71 376.89 48 317.11 48 250.3V208c0-8.84-7.16-16-16-16H16c-8.84 0-16 7.16-16 16v40.16c0 89.64 63.97 169.55 152 181.69V464H96c-8.84 0-16 7.16-16 16v16c0 8.84 7.16 16 16 16h160c8.84 0 16-7.16 16-16v-16c0-8.84-7.16-16-16-16h-56v-33.77C285.71 418.47 352 344.9 352 256v-48c0-8.84-7.16-16-16-16z"></path></svg>

    let micOnIcon = <svg style={buttonStyle}  aria-hidden="true" data-prefix="fas" data-icon="microphone-slash" className="svg-inline--fa fa-microphone-slash fa-w-20" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 512"><path fill="currentColor" d="M633.82 458.1l-157.8-121.96C488.61 312.13 496 285.01 496 256v-48c0-8.84-7.16-16-16-16h-16c-8.84 0-16 7.16-16 16v48c0 17.92-3.96 34.8-10.72 50.2l-26.55-20.52c3.1-9.4 5.28-19.22 5.28-29.67V96c0-53.02-42.98-96-96-96s-96 42.98-96 96v45.36L45.47 3.37C38.49-2.05 28.43-.8 23.01 6.18L3.37 31.45C-2.05 38.42-.8 48.47 6.18 53.9l588.36 454.73c6.98 5.43 17.03 4.17 22.46-2.81l19.64-25.27c5.41-6.97 4.16-17.02-2.82-22.45zM400 464h-56v-33.77c11.66-1.6 22.85-4.54 33.67-8.31l-50.11-38.73c-6.71.4-13.41.87-20.35.2-55.85-5.45-98.74-48.63-111.18-101.85L144 241.31v6.85c0 89.64 63.97 169.55 152 181.69V464h-56c-8.84 0-16 7.16-16 16v16c0 8.84 7.16 16 16 16h160c8.84 0 16-7.16 16-16v-16c0-8.84-7.16-16-16-16z"></path></svg>
    
    let resetIcon = 
<svg aria-hidden="true" style={{height:'1.1em'}}  role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M500.333 0h-47.411c-6.853 0-12.314 5.729-11.986 12.574l3.966 82.759C399.416 41.899 331.672 8 256.001 8 119.34 8 7.899 119.526 8 256.187 8.101 393.068 119.096 504 256 504c63.926 0 122.202-24.187 166.178-63.908 5.113-4.618 5.354-12.561.482-17.433l-33.971-33.971c-4.466-4.466-11.64-4.717-16.38-.543C341.308 415.448 300.606 432 256 432c-97.267 0-176-78.716-176-176 0-97.267 78.716-176 176-176 60.892 0 114.506 30.858 146.099 77.8l-101.525-4.865c-6.845-.328-12.574 5.133-12.574 11.986v47.411c0 6.627 5.373 12 12 12h200.333c6.627 0 12-5.373 12-12V12c0-6.627-5.373-12-12-12z"></path></svg>
    
    let stopIcon2=
<svg aria-hidden="true" style={{height:'1.4em'}}  role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="currentColor" d="M440.5 88.5l-52 52L415 167c9.4 9.4 9.4 24.6 0 33.9l-17.4 17.4c11.8 26.1 18.4 55.1 18.4 85.6 0 114.9-93.1 208-208 208S0 418.9 0 304 93.1 96 208 96c30.5 0 59.5 6.6 85.6 18.4L311 97c9.4-9.4 24.6-9.4 33.9 0l26.5 26.5 52-52 17.1 17zM500 60h-24c-6.6 0-12 5.4-12 12s5.4 12 12 12h24c6.6 0 12-5.4 12-12s-5.4-12-12-12zM440 0c-6.6 0-12 5.4-12 12v24c0 6.6 5.4 12 12 12s12-5.4 12-12V12c0-6.6-5.4-12-12-12zm33.9 55l17-17c4.7-4.7 4.7-12.3 0-17-4.7-4.7-12.3-4.7-17 0l-17 17c-4.7 4.7-4.7 12.3 0 17 4.8 4.7 12.4 4.7 17 0zm-67.8 0c4.7 4.7 12.3 4.7 17 0 4.7-4.7 4.7-12.3 0-17l-17-17c-4.7-4.7-12.3-4.7-17 0-4.7 4.7-4.7 12.3 0 17l17 17zm67.8 34c-4.7-4.7-12.3-4.7-17 0-4.7 4.7-4.7 12.3 0 17l17 17c4.7 4.7 12.3 4.7 17 0 4.7-4.7 4.7-12.3 0-17l-17-17zM112 272c0-35.3 28.7-64 64-64 8.8 0 16-7.2 16-16s-7.2-16-16-16c-52.9 0-96 43.1-96 96 0 8.8 7.2 16 16 16s16-7.2 16-16z"></path></svg>   

    
  
    let inputStyle={marginBottom:'0.5em',fontSize:'0.9em'};
    let config = this.state.config;
    return <div>
        {(!this.state.activated) && <span  onClick={this.activate}>{micOnIcon}</span>} 
        {(this.state.activated && this.state.sending) && <span onTouchStart={this.showConfig}  onTouchEnd={this.clearConfigTimer}   onMouseDown={this.showConfig} onMouseUp={this.clearConfigTimer} onContextMenu={this.showConfigNow} onClick={this.stopRecording}>{micOffIcon}</span>} 
        {(this.state.activated && !this.state.sending) && <span onTouchStart={this.showConfig}  onTouchEnd={this.clearConfigTimer}   onMouseDown={this.showConfig} onMouseUp={this.clearConfigTimer} onContextMenu={this.showConfigNow} onClick={this.startRecording}>{micOnIcon}</span>} 
        {(this.state.showMessage ) && <div style={{padding:'1em', borderRadius:'20px',backgroundColor:'skyblue',margin:'5%',width:'90%',top:'1.7em',color:'black',border:'2px solid blue'}} >
                {this.state.lastTranscript && <div style={{fontStyle:'italic'}}>{this.state.lastTranscript}</div>}
                {false && this.state.lastIntent && <div>{this.state.lastIntent}</div>}
                {this.state.lastTts && <div>{this.state.lastTts}</div>}
            </div>} 
   
        <div id="audio"></div>
      
      </div>
    
  }
}
 //configurationChange(e) {
        //let that = this;
        ////console.log(['configurationChange',this,e,e.target.value,e.target.id]);
        //let config = this.state.config;
        //config[e.target.id] = e.target.value;
        //this.setState(config);
        //// set silence threshhold directly
        //if (e.target.id === "silencesensitivity" && this.speechEvents) {
            //this.speechEvents.setThreshold(this.getThreshholdFromVolume(this.state.config.silencesensitivity));
        //} else if (e.target.id === "inputvolume" ) {
            //// update all input gain nodes
            //this.inputGainNodes.map(function(node) {
                ////console.log(['set gain',node,that.state.config.inputvolume/100]);
                //node.gain.value = that.state.config.inputvolume/100;
            //});
            
        //}
        //localStorage.setItem(this.appendUserId('snipsmicrophone_config',this.props.user),JSON.stringify(config));
    //};
    
    //addInputGainNode(node) {
        //this.inputGainNodes.push(node);
    //};

 
    
    //playSound(bytes) {
        
        //if (this.state.config.enableaudio !== "no") {
            //var buffer = new Uint8Array( bytes.length );
            //buffer.set( new Uint8Array(bytes), 0 );
            //let audioContext = window.AudioContext || window.webkitAudioContext;
            //let context = new audioContext();
            //let gainNode = context.createGain();
            //// initial set volume
            //gainNode.gain.value = this.state.config.outputvolume > 0 ? this.state.config.outputvolume/100 : 0.5;
          
            //context.decodeAudioData(buffer.buffer, function(audioBuffer) {
                //var source = context.createBufferSource();
                //source.buffer = audioBuffer;
                //source.connect(gainNode);
                //gainNode.connect( context.destination );
                //source.start(0);
            //});            
        //}
    //}
