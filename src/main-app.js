// @ts-check

import {html, render} from '../modules/lit-html/lib/lit-extended.js';
import {repeat} from '../modules/lit-html/lib/repeat.js';


export class MainApp extends HTMLElement {

  constructor() {
    super();
    console.log("Constructor");
    this._devices = [];
    this._form = {};
    this.attachShadow({mode: 'open'});
  }

  connectedCallback() {
    this.invalidate();
    this._checkPairedDevices();
  }

  render() {
      return html`
        <style>
          .btn {
            border: 2px solid black;
          }

          .disabled {
            color: #888;
            font-style: italic;
          }

          code { white-space: pre };
        </style>
        <div>Web USB Tester</div><br>
        Vendor ID: <input id="vid" on-input=${(e)=>this._hexInputChanged(e,4)}/> -  
        Product ID: <input id="pid" on-input=${(e)=>this._hexInputChanged(e,4)}/><br>
        <button on-click=${(e)=>this._doScan(e)}>PAIR NEW DEVICE</button>
        <p>Paired and connected devices: <br><br>${this._devicesInfo()}</p>
<code>
navigator.usb.requestDevice({ filters: [{
    <span class$='${this._form.vid ? '' : 'disabled'}'>vendorId: 0x${this._form.vid ? this._form.vid : '????'}</span><span class$='i4 ${this._form.pid && this._form.vid ? '' : 'disabled'}'>, </span>
    <span class$='${this._form.pid ? '' : 'disabled'}'>productId: 0x${this._form.pid ? this._form.pid : '????'}</span>
}]});
</code>
        `;
  }

  invalidate() {
    if (!this.needsRender) {
      this.needsRender = true;
      Promise.resolve().then(() => {
        this.needsRender = false;
        render(this.render(), this.shadowRoot);
      });
    }
  }

  _deviceDisconnected(device) {
    console.log('Disconnected', device);
    const idx = this._devices.findIndex(dev => { return dev === device; });

    if(idx >= 0) {
      this._devices.splice(idx,1)
      this.invalidate();
    }
  }

  async _tryAttachDevice(device) {
    console.log(device);
    if(!device)
      return;
  
    await device.open();
    if (device.configuration === null)
      await device.selectConfiguration(1);

    console.log('device trying to attach', device);

    this._devices.push(device);
    this.invalidate();
    return; 

    // todo: dev code below...

    if(device.productId === 0xD017) {
      await device.claimInterface(2);
      // empiriKit|MOTION
      device.controlTransferOut({
        requestType: 'class',
        recipient: 'interface',
        request: 0x22,
        value: 0x01,
        index: 0x02})
      .then(o => {
        console.log(o);
        const newDevice = {
          device: device,
          endpointNumber: 5,
          type: "empiriKit|MOTION"
        };
        // this._devices.push(newDevice);
        // this._readFromDevice(newDevice);
        // this.invalidate();
        this.invalidate();
      }, e => {
        console.log(e); //disconnectDevice(device);
      });  
    } else if(device.productId === 0xA800) {
      // Debug code to at least initiate communication with the weblight ;)
      await device.claimInterface(0);
      
      var rgb = new Uint8Array(3);
      rgb[0] = 0x20;
      rgb[1] = 0;
      rgb[2] = 0;

      device.controlTransferOut({
        'requestType': 'vendor',
        'recipient': 'device',
        'request': 0x01,
        'value': 0x00,
        'index': 0x00}, rgb)
      .then(o => {
        console.log(o);
        const newDevice = {
          device: device,
          type: "WebLight"
        };
        // this._devices.push(newDevice);
        // this.invalidate();
        this.invalidate();
      }, e => {
        console.log(e); //disconnectDevice(device);
      });
    }
  }

  _checkPairedDevices() {
    navigator.usb.getDevices()
    .then(availableDevices => {
      availableDevices.forEach(device => this._tryAttachDevice(device))
    })
    .catch(error => { console.log(error); });

    navigator.usb.addEventListener('connect', evt => this._tryAttachDevice(evt.device));
    navigator.usb.addEventListener('disconnect', evt => {this._deviceDisconnected(evt.device)});
  }

  async _doScan(evt) {
    try {
      let device = await navigator.usb.requestDevice({ filters: [{
          vendorId: this._form.vid ? Number.parseInt(this._form.vid, 16) : undefined,
          productId: this._form.pid ? Number.parseInt(this._form.pid, 16) : undefined
      }]});

      this._tryAttachDevice(device);
    } catch (e) {
      // No device was selected.
      console.log(e);
    }
  }

  _hexInputChanged(evt, len) {
    const input = evt.target;
    const rxHex = RegExp('^[0-9a-fA-F]+$');
    const isHex = rxHex.test(input.value);
    const isRightSize = input.value.length === len;

    if(input.id && input.id.length) {
      if(isHex && isRightSize) {
        this._form[input.id] = input.value;
      } else {
        this._form[input.id] = undefined;
      }
      this.invalidate();  
    }
  }

  _upperHex(val, len) {
    return val.toString(16).padStart(4,'0').toUpperCase();
  }

  _devicesInfo() {
    if(!this._devices.length)
      return "- none - ";

    return html`
      <ul>
      ${repeat(this._devices, (d) => d.id, (d, index) => {
        const ifs = d.configuration.interfaces || [];
        return html`
          <li>${index}: ${d.productName} - VID: 0x${this._upperHex(d.vendorId, 4)}, PID: 0x${this._upperHex(d.productId, 4)}, S/N: ${d.serialNumber}</li>
          <ul>
            ${repeat(ifs, (i) => i.id, (i, idx) => html`<li>Interface ${i.interfaceNumber} claimed: ${i.claimed}`)}
          </ul>
        `})
      }
      </ul>
    `;
  }

  _readFromDevice(dev) {
    dev.device.transferIn(dev.endpointNumber, 64).then(result => {
      let decoder = new TextDecoder();
      this.rstring += decoder.decode(result.data);
      // do a quick JSON smoketest (should do better with decoder/streaming)
      let startb = (this.rstring.match(/{/g)||[]).length;
      let endb = (this.rstring.match(/}/g)||[]).length;
      if(startb > 0 && startb === endb) {
        try {
          let msg = JSON.parse(this.rstring);
          //this.dispatchEvent(new CustomEvent('ek-event', {detail:msg}), {bubbles: true});
          console.log('Received', msg);
        } catch(e) {
          console.log("NOT JSON:",this.rstring);
        }
        this.rstring = "";
      }
      this._readFromDevice(dev);
    })
    .catch(error => { console.log(error); this.invalidate(); });
  }

  // TODO: Make generic...
  _sendCMD(str) {
    console.log(`Sending to serial: [${str}]\n`);
    let data = new TextEncoder('utf-8').encode(str);
    console.log(data);
    if (this.device) {
      this.device.transferOut(5, data);
    }
  };

}
customElements.define('main-app', MainApp);
