'use strict'

import React from 'react'
import PropTypes from 'prop-types'
import TransitionGroup from 'react-addons-css-transition-group'
import Clipboard from 'clipboard'
import highlight from 'highlight.js'

import Highlight from 'components/plugins/highlight'

import { getHumanReadableBytes, toArrayBuffer } from 'utils/utils.js'
import Logger from 'utils/logger'

import ChannelActions from 'actions/ChannelActions'

import 'styles/File.scss'

const logger = new Logger()

class File extends React.Component {
  constructor (props) {
    super(props)
    this.ext = /(?:\.([^.]+))?$/.exec(props.name)[1]
    this.state = {
      meta: props.meta,
      showPreview: false,
      previewContent: 'Loading...'
    }
    this.clipboard = new Clipboard('.clipboard-' + props.hash, {
      text: function (trigger) {
        logger.info(props.hash + ' copied to clipboard!')
        return props.hash
      }
    })
  }

  get isVideo () {
    return (
      this.ext === 'mp4' ||
      this.ext === 'webm' ||
      this.ext === 'ogv' ||
      this.ext === 'avi' ||
      this.ext === 'mkv'
    )
  }

  get isAudio () {
    return this.ext === 'mp3' || this.ext === 'ogg' || this.ext === 'wav'
  }

  get isImage () {
    const supportedImageTypes = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg']
    return supportedImageTypes.includes(this.ext.toLowerCase())
  }

  get isHighlightable () {
    return highlight.getLanguage(this.ext) || this.ext === 'txt'
  }

  loadFile (el) {
    if (!this.state.showPreview) return

    const isElectron = !!window.ipfsInstance
    const isMedia = this.isAudio | this.isVideo | this.isImage
    const asURL = isElectron & isMedia
    const asStream = this.isVideo
    let blob = new Blob([])

    ChannelActions.loadFile(this.props.hash, asURL, asStream, (err, buffer, url, stream) => {
      if (err) {
        console.error(err)
        return
      }

      let previewContent = 'Unable to display file.'
      if (buffer || url || stream) {
        if (buffer instanceof Blob) {
          blob = buffer
        } else if (buffer && this.state.meta.mimeType) {
          const arrayBufferView = toArrayBuffer(buffer)
          blob = new Blob([arrayBufferView], { type: this.state.meta.mimeType })
        }

        if (buffer) url = window.URL.createObjectURL(blob)

        if (this.isAudio) {
          previewContent = <audio src={url} controls autoPlay={true} />
        } else if (this.isImage) {
          previewContent = <img src={url} />
        } else if (this.isVideo) {
          if (isElectron) {
            previewContent = <video src={url} controls autoPlay={true} />
            this.setState({ previewContent }, () => this.props.onPreviewOpened(el))
            return
          } else {
            const mimeCodec = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
            const source = new MediaSource()
            url = window.URL.createObjectURL(source)

            source.addEventListener('sourceopen', e => {
              const sourceBuffer = source.addSourceBuffer(mimeCodec)
              const buf = []

              sourceBuffer.addEventListener('updateend', () => {
                if (buf.length > 0) sourceBuffer.appendBuffer(buf.shift())
              })

              stream.on('data', data => {
                if (!sourceBuffer.updating) sourceBuffer.appendBuffer(toArrayBuffer(data))
                else buf.push(toArrayBuffer(data))
              })
              stream.on('end', () => {
                setTimeout(() => {
                  if (source.readyState === 'open') source.endOfStream()
                }, 100)
              })
              stream.on('error', e => console.error(e))
            })

            previewContent = <video src={url} controls autoPlay={true} />
          }
        } else {
          const fileReader = new FileReader()
          fileReader.onload = event => {
            previewContent = this.isHighlightable ? (
              <Highlight>{event.target.result}</Highlight>
            ) : (
              <pre>{event.target.result}</pre>
            )
            this.setState({ previewContent }, () => this.props.onPreviewOpened(el))
          }
          fileReader.readAsText(blob, 'utf-8')
          return
        }
      }
      this.setState({ previewContent }, () => this.props.onPreviewOpened(el))
    })
  }

  handleClick (evt) {
    const el = evt.target

    if (!this.isImage && !this.isHighlightable && !this.isAudio && !this.isVideo) return

    evt.stopPropagation()

    this.setState(
      {
        showPreview: !this.state.showPreview,
        previewContent: 'Loading...'
      },
      this.loadFile.bind(this, el)
    )
  }

  render () {
    const gateway = window.gatewayAddress
      ? 'http://' + window.gatewayAddress
      : 'https://ipfs.io/ipfs/'
    const openLink = gateway + this.props.hash + '/'
    const size = getHumanReadableBytes(this.props.size)
    const className = `clipboard-${this.props.hash} download`
    const preview = <div className="preview smallText">{this.state.previewContent}</div>
    return (
      <div className="File" key={this.props.hash}>
        <TransitionGroup
          transitionName="fileAnimation"
          transitionEnter={true}
          transitionLeave={false}
          transitionAppearTimeout={0}
          transitionEnterTimeout={1000}
          transitionLeaveTimeout={0}
          component="div"
          className="content"
        >
          <span className="text" onClick={this.handleClick.bind(this)}>
            {this.props.name}
          </span>
          <span className="size">{size}</span>
          <a className="download" href={openLink} target="_blank" rel="noopener noreferrer">
            Open
          </a>
          <a className="download" href={openLink} download={this.props.name}>
            Download
          </a>
          <span className={className}>Copy Hash</span>
          {this.state.showPreview && preview}
        </TransitionGroup>
      </div>
    )
  }
}

File.propTypes = {
  hash: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  size: PropTypes.number.isRequired,
  meta: PropTypes.object.isRequired,
  onPreviewOpened: PropTypes.func.isRequired
}

export default File
