'use strict';

const ping = require('ping');
const request = require('request-promise');
const uri = require('url');
const fs = require('fs');
const _ = require('lodash');
const types = require(__dirname + '/datapoints');
const proc = require(__dirname + '/process');
const webcam = require(__dirname + '/webcam');

let urlTokenGet = '/action/tokenGet';
let urlLogoutPost = '/action/logout';
let urlDeviceListGet = '/action/deviceListGet';
let urlDevicePSSListGet = '/action/deviceListPSSGet';
let urlPanelCondGet = '/action/panelCondGet';
let urlPanelCondPost = '/action/panelCondPost';
let urlDeviceSwitchPSSPost = '/action/deviceSwitchPSSPost';
let urlHaExecutePost = '/action/haExecutePost';
let urlDeviceEditGet = '/action/deviceEditGet';
let urlDeviceEditPost = '/action/deviceEditPost';
let urlDeviceSwitchDimmerPost = '/action/deviceSwitchDimmerPost';
let urlDeviceHueColorControl = '/action/deviceHueColorControl';
let urlDeviceEditThermoPost = '/action/deviceEditThermoPost';
let urlDeviceEditThermoGet = '/action/deviceEditThermoGet';
let urlDeviceEditShutterPost = '/action/deviceEditShutterPost';
let urlDeviceEditShutterGet = '/action/deviceEditShutterGet';
let urlDeviceEditMeterGet = '/action/deviceEditMeterGet';
let urlDeviceEditMeterPost = '/action/deviceEditMeterPost';
let urlDeviceNukiCmd = '/action/nukiCmd';
let urlIpcamGet = '/action/ipcamGet';
let urlPasthru = '/action/passthru';
let urlDeviceListUPICGet = '/action/deviceListUPICGet';
let urlDeviceDoUPICPost = '/action/deviceDoUPICPost';
let urlSendSMSPost = '/action/sendSMSPost';
let urlSmsgwTestPost = '/action/smsgwTestPost';
let urlSystemGet = '/action/systemGet';
let urlLogsGet = '/action/logsGet';
let urlrecordListGet = '/action/recordListGet';

/**
 * round(2.74, 0.1) = 2.7
 * round(2.74, 0.25) = 2.75
 * round(2.74, 0.5) = 2.5
 * round(2.74, 1.0) = 3.0
 * @param {*} value 
 * @param {*} step 
 */
function round(value, step) {
  step || (step = 1.0);
  let inv = 1.0 / step;
  return Math.round(value * inv) / inv;
}

/**
 * ping host
 * @param {string} host - hostname or ip-address
 */
function pingAsync(host) {
  return new Promise((resolve, reject) => {
    ping.sys.probe(host, (isAlive) => {
      if (isAlive) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

/**
 * Wait / Sleep x milliseconds
 * @param {number} ms - time in ms to wail
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get variable type of value 
 * @param {any} status - value
 */
function getPropertyType(status) {
  let type;
  switch (Object.prototype.toString.call(status)) {
    case '[object Object]':
      type = 'object';
      break;
    case '[object Array]':
      type = 'array';
      break;
    case '[object Number]':
      type = 'number';
      break;
    case '[object Boolean]':
      type = 'boolean';
      break;
    case '[object String]':
      type = 'string';
      break;
    default:
      break;
  }
  return type;
}

/**
 * Checks if propertis of object A and object B are equal
 * @param {object} obja - Object A
 * @param {object} objb - Object B
 */
function propertiesObjAinObjB(obja, objb) {
  if (obja === objb) return true;
  if (!(obja instanceof Object) || !(objb instanceof Object)) return false;
  if (obja.constructor !== objb.constructor) return false;
  for (let p in obja) {
    if (!obja.hasOwnProperty(p)) continue;
    if (!objb.hasOwnProperty(p)) return false;
    if (obja[p] === objb[p]) continue;
    if (typeof (obja[p]) !== 'object') return false;
    if (!this.propertiesObjAinObjB(obja[p], objb[p])) return false; // Objects and Arrays must be tested recursively
  }
  return true;
}

/**
 * Copy Object
 * @param {object} obj - object to copy
 */
function copyObject(obj) {
  let objcopy;
  // if (obj) objcopy = JSON.parse(JSON.stringify(obj));
  if (obj) objcopy = _.cloneDeep(obj);
  return objcopy;
}

/**
 * Get Time now in Seconds
 */
function getNow() {
  return Math.floor(Date.now() / 1000);
}


function isEmpty(obj) {
  for (let x in obj) { return false; }
  return true;
}

/**
 * Lupusec Class
 */
class Lupus {

  constructor(adapter, language) {
    this.adapter = adapter;
    this.language = language || 'EN';
    this.hostname = this.adapter.config.alarm_host;
    this.port = this.adapter.config.alarm_port;
    this.https = this.adapter.config.alarm_https || false;
    this.username = this.adapter.config.alarm_user;
    this.password = this.adapter.config.alarm_password;
    this.process = {};
    this.allstates = this.adapter.config.alarm_allstates || false;
    this.tokentimeout = this.adapter.config.alarm_tokentimeout || 60; // to get every 60 seconds a new token 
    this.types = {};
    this.token = {};
    // this.auth = 'Basic ' + new Buffer(this.username + ':' + this.password).toString('base64');
    this.auth = 'Basic ' + Buffer.from(this.username + ':' + this.password).toString('base64');
    this.callByDelayObj = {};
    this.webcams = [];
    this.webcam;
    this.states = {};
    if (!this.port) this.port = this.https === true ? 443 : 80;
    if (this.https && this.port === 443) this.url = 'https://' + this.hostname;
    if (this.https && this.port !== 443) this.url = 'https://' + this.hostname + ':' + this.port;
    if (!this.https && this.port === 80) this.url = 'http://' + this.hostname;
    if (!this.https && this.port !== 80) this.url = 'http://' + this.hostname + ':' + this.port;
    // this.url = this.https ? 'https://' + this.hostname + ':' + this.port : 'http://' + this.hostname + ':' + this.port;
    this.setLangages();
  }

  /**
   * Concatenate url + path
   * @param {string} path - path of url 
   */
  getURL(path) {
    return this.url + path;
  }

  /*
  getState(id) {
    if (id && id.startsWith(this.adapter.namespace + '.')) {
      return this.actualstates[id];
    } else {
      return this.actualstates[this.adapter.namespace + '.' + id];
    }
  }
  */

  async getState(id) {
    try {
      let tmpid = id.replace(this.adapter.namespace + '.', '');
      return (await this.adapter.getStateAsync(tmpid)).val;
    } catch (e) {
      return undefined;
    }
  }

  async promiseAll(promises) {
    this.parallel = true;
    if (this.parallel) {
      await Promise.all(promises);
    } else {
      for (let i in promises) {
        await promises[i];
      }
    }
  }

  getCallByDelayObj(id, statusname) {
    if (this.callByDelayObj[id] && this.callByDelayObj[id][statusname]) {
      return this.callByDelayObj[id][statusname];
    } else {
      return undefined;
    }
  }

  setCallByDelayObj(id, statusname, value) {
    if (!this.callByDelayObj[id]) this.callByDelayObj[id] = {};
    this.callByDelayObj[id][statusname] = value;
  }

  /**
   * Converts a string to string or to a number 
   * @param {*} value - string or number
   */
  convStringNumber(value) {
    let oldvalue = value;
    switch (typeof value) {
      case 'string':
        if (value === 'true') { value = true; }
        else if (value === 'false') { value = false; }
        // else if (!isNaN(value) && value !== '') { value = parseFloat(value); }
        else if (!isNaN(value)) {
          value = parseFloat(value);
          if (isNaN(value)) value = oldvalue;
        }
        break;
      default:
        break;
    }
    return value;
  }

  /**
  * Execute a callback function after x msec with a delayname. if you call callByDelay
  * again, with a callback funtion, the older one will be canceld if not executed
  * till now
  * @param {*} callback 
  * @param {*} delayname 
  */
  callByDelay(callback, id, statusname, delay) {
    let handle = this.getCallByDelayObj(id, statusname);
    if (delay === undefined) delay = 500;
    if (handle) {
      clearTimeout(handle);
    }
    if (!this.callByDelayObj[id]) this.callByDelayObj[id] = {};
    handle = setTimeout(() => {
      delete this.callByDelayObj[id][statusname];
      callback();
    }, delay);
    this.setCallByDelayObj(id, statusname, handle);
  }

  /**
   * Pollseconds okay
   */
  async setPollSecOk() {
    if (this.errorWaitSec > 0) {
      this.adapter.log.info('Poll rythmus chnaged back after an Error from ' + this.errorWaitSec + ' to default values!');
      this.errorWaitSec = 0;
      this.errorTime = undefined;
      /*
      for (let i in this.process) {
        let process = this.process[i];
        process.obj.setPollSec(process.polltime);
      }
      */
    }
  }

  /**
   * Pollseconds error
   */
  async setPollSecErrorOld(message) {
    // we check every 5 sec. the status
    if (this.lasterrorcheck && this.lasterrorcheck > getNow()) return;
    this.lasterrorcheck = getNow() + 5;
    let alive = await pingAsync(this.hostname);
    if (!alive) {
      this.adapter.log.error('Lupusec alarm system ' + this.hostname + ' is not reachable by ping.');
      return;
    }
    // now we set the error timer
    let now = getNow();
    if (!this.errorWaitSec || this.errorWaitSec === 0) {
      this.errorWaitSec = 15;
      this.errorTime = getNow() - this.errorWaitSec;
    }
    if (this.errorWaitSec > 300) this.errorWaitSec = 300;
    if ((now - this.errorTime) >= this.errorWaitSec) {
      this.adapter.log.error('Error: ' + message);
      this.adapter.log.error('Poll rythmus chnaged to ' + this.errorWaitSec + ' seconds because of error!');
      /*
      for (let i in this.process) {
        let process = this.process[i];
        process.obj.setPollSec(this.errorWaitSec);
      }
      */
      this.errorWaitSec += 15;
      this.errorTime = getNow();
    }
  }

  async setPollSecError(message) {
    // we check every 5 sec. the status
    let now = getNow();
    if (this.errorWaitSec > 300) this.errorWaitSec = 300;
    if (!this.errorWaitSec || this.errorWaitSec === 0 || (now - this.errorTime) >= this.errorWaitSec) {
      if (!this.errorWaitSec) this.errorWaitSec = 0;
      this.errorWaitSec += 15;
      this.errorTime = getNow();
      this.adapter.log.error('Error: ' + message);
      this.adapter.log.error('Poll rythmus chnaged to ' + this.errorWaitSec + ' seconds because of error!');
    }
  }

  async isPollingAlloed() {
    if (!this.errorWaitSec || this.errorWaitSec === 0) return true;
    let errorWaitSecNow = getNow() - this.errorTime;
    if (errorWaitSecNow >= this.errorWaitSec) {
      let alive = await pingAsync(this.hostname);
      if (!alive) {
        this.adapter.log.error('Lupusec alarm system ' + this.hostname + ' is not reachable by ping.');
        this.errorWaitSec = 15;
        this.errorTime = getNow();
        return false;
      } else {
        return true;
      }
    }
    return false;
  }

  async hostAliveError() {
    try {
      let alive = await pingAsync(this.hostname);
      while (alive === false) {
        let waitsec = 15;
        this.adapter.log.error('Lupusec alarm system ' + this.hostname + ' is not reachable by ping. Wait ' + waitsec + ' seconds for next try!');
        await sleep(waitsec * 1000);
        alive = await pingAsync(this.hostname);
        if (alive === true) {
          this.adapter.log.info('Lupusec alarm system ' + this.hostname + ' is now reachable by ping again!');
          return true;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async setOnlineStatus(status) {
    let deviceid = 'status';
    let devicename = 'Status Alarmanlage';
    let stateid = deviceid + '.online';
    let statename = devicename + ' (Online)';
    await this.setObjectOrUpdate(deviceid, {
      type: 'device',
      common: {
        name: devicename,
        icon: '/icons/zentrale.png'
      },
      native: {}
    });
    await this.setObjectOrUpdate(stateid, {
      type: 'state',
      common: {
        type: 'boolean',
        role: 'state',
        name: statename,
        icon: '/icons/zentrale.png',
        read: true,
        write: false,
        states: 'false:not online;true:online'
      },
      native: {}
    }, status, true);
  }

  /**
   * Get typlist vor type
   * @param {number} lupusType - Lupusec Type like 38
   */
  getTypeList(lupusType) {
    let ret;
    if (types) ret = types.typeList['TYPE_' + lupusType];
    if (!ret) {
      ret = {
        name: 'Unknown',
        devlist: 'type_unknown'
      };
    }
    return ret;
  }

  setTypeById(id, type) {
    this.types[id] = type;
  }

  getTypeById(id) {
    return (this.types[id] || 0);
  }

  setDatapointLanguage(dp) {
    if (dp) {
      let language = this.language.toLowerCase();
      if (dp && dp['name_' + language]) dp.name = dp['name_' + language];
      if (dp && dp['states_' + language]) dp.states = dp['states_' + language];
      if (dp && !dp.name && dp.name_en) dp.name = dp.name_en;
      if (dp && !dp.states && dp.states_en) dp.states = dp.states_en;
      for (let i in dp) {
        if (i.startsWith('name_') || i.startsWith('states_'))
          delete dp[i];
      }
    }
    return dp;
  }

  getDatapointDeviceList(lupusType, name) {
    let dp;
    let ret = this.getTypeList(lupusType) || {};
    if (ret) {
      dp = types.dpDeviceList[ret.devlist][name] || types.dpDeviceList.type_all[name] || undefined;
    }
    if (dp) {
      // dp = copyObject(dp);
      // dp = this.setDatapointLanguage(dp);
    }
    return dp;
  }

  setLangages() {
    let dpList = copyObject(types.dpDeviceList);
    for (let i in dpList) {
      for (let j in dpList[i]) {
        dpList[i][j] = this.setDatapointLanguage(dpList[i][j]);
        let dp = dpList[i][j];
      }
    }
    types.dpDeviceList = dpList;
  }

  getIcon(devicetype) {
    let ret = this.getTypeList(devicetype) || {};
    let icon;
    if (ret && ret.icon) icon = ret.icon;
    return icon;
  }

  /**
   * 
   * @param {string} text - string where special characters will be removed
   */
  delSonderzeichen(text) {
    if (text) {
      text = text.replace(/\r/g, '');
      text = text.replace(/\n/g, '');
      text = text.replace(/\t/g, ' ');
      text = text.replace(/\f/g, '');
    }
    return text;
  }

  /**
   * Lupusec Status to Apple Home Status
   * @param {number} mode_pc_a - Area 1 or 2 (1,2)
   * @param {number} alarm_ex - 0 = Disarm, 1 = Arm, 2 = Home1, 3 = Home2, 4 = Home3
   */
  getAppleStautusFromLupusec(mode_pc_a, alarm_ex) {
    let alarm = null; // disarm
    mode_pc_a = Number(mode_pc_a);
    alarm_ex = Number(alarm_ex);
    switch (mode_pc_a) {
      case 0: // Disarm
        alarm = 3; // disarm = 3 (The security system is disarmed)
        break;
      case 1: // Arm
        alarm = 1; // awayArm = 1 (The home is unoccupied)
        break;
      case 2: // Home
        alarm = 2; // nightArm = 2 (The home is occupied and residents are sleeping)
        break;
      case 3: // Home 
        alarm = 0; // stayArm = 0 (The home is occupied and residents are active)
        break;
      case 4: // Home
        alarm = 0; // stayArm = 0 (The home is occupied and residents are active)
        break;
      default:
        break;
    }
    if (mode_pc_a > 0 && alarm_ex == 1) {
      alarm = 4; // triggered = 4 (the security system is triggered)
    }
    return alarm;
  }


  /**
   * Apple Home Status to Lupusec Status
   * @param {number} applestatus - Apple Status
   */
  getLupusecFromAppleStautus(applestatus) {
    let alarm = null;
    switch (applestatus) {
      case 0: // Home 
        alarm = 3; // stayArm = 0 (The home is occupied and residents are active)
        break;
      case 1: // Arm
        alarm = 1; // awayArm = 1 (The home is unoccupied)
        break;
      case 2: // Home
        alarm = 2; // nightArm = 2 (The home is occupied and residents are sleeping)
        break;
      case 3: // Disarm
        alarm = 0; // disarm = 3 (The security system is disarmed)
        break;
      case 4: // Alarm triggered
        break;
      default:
        break;
    }
    return alarm;
  }

  /**
   * Create object if not exist or set state 
   * @param {number} id - Id
   * @param {object} obj - object description
   * @param {any} value - value
   * @param {boolean} ack - acknowledge
   */
  setObjectOrUpdate(id, obj, value, ack, renew) {
    return new Promise(async (resolve) => {
      try {
        if (id && obj) {
          let unixtime = Math.round(new Date().getTime());
          if (!ack) ack = false;
          if ((!renew)) renew = false;
          if (typeof obj !== 'undefined') await this.adapter.setObjectNotExistsAsync(id, obj);
          let objold = await this.adapter.getObjectAsync(id);
          if (obj && objold && obj.common && objold.common && obj.common.name !== objold.common.name || (obj.common.role !== objold.common.role)) {
            objold.common.name = obj.common.name;
            objold.common.role = obj.common.role;
            this.adapter.log.info('Changing properties of object ' + id);
            await this.adapter.extendObjectAsync(id, objold);
          }
          if (typeof value !== 'undefined') {
            let oldstate = await this.adapter.getStateAsync(id);
            let factor = 5;
            let difftime = oldstate && oldstate.ts ? unixtime - (oldstate.ts + (1000 * factor)) : 0;
            if (!oldstate || oldstate.val != value || oldstate.ack !== ack || renew) {
              if (!oldstate) {
                await this.adapter.setStateAsync(id, value, ack);
              } else if (oldstate.val == value && oldstate.ack === false) {
                // } else if (difftime >= 0 && oldstate.ack === false) {
                // ack gesetzt, sonst ist alles so geblieben
                await this.adapter.setStateAsync(id, value, ack);
              } else if (difftime >= 0 || oldstate.ack === ack) {
                await this.adapter.setStateAsync(id, value, ack);
              }
            }
          }
          resolve(true);
        }
      } catch (error) {
        this.adapter.log.error('setObjectOrUpdate: ' + error);
        resolve(false);
      }
    });
  }

  async getAllDevices() {
    let ids = {};
    try {
      let objs = await this.adapter.getAdapterObjectsAsync();
      for (let id in objs) {
        if (id && id.startsWith(this.adapter.namespace + '.devices.')) {
          let obj = objs[id];
          if (obj && obj.type === 'state') {
            id = id.replace(this.adapter.namespace + '.devices.', '');
            let idtmp = id.split('.').shift();
            if (!ids[idtmp]) ids[idtmp] = [];
            ids[idtmp].push(id);
          }

        }
      }
    } catch (error) {
      //
    }
    return ids;
  }

  async deleteDevices(ids) {
    if (!isEmpty(ids)) {
      let promises = [];
      for (let id in ids) {
        let channelid = this.adapter.namespace + '.devices.' + id;
        this.adapter.log.info('Deleting device : ' + id);
        promises.push(this.adapter.delObjectAsync(channelid));
        let obj = ids[id];
        for (let i in obj) {
          let stateid = this.adapter.namespace + '.devices.' + obj[i];
          promises.push(this.adapter.delObjectAsync(stateid));
        }
      }
      let result = await this.promiseAll(promises);
      return result;
    }
  }

  /**
   * Delete old states
   */
  async deleteOldSates() {
    let ids;
    try {
      let obj = await this.adapter.getAdapterObjectsAsync();
      for (let id in obj) {
        id = id.replace(this.adapter.namespace + '.', '');
        // let state = await this.adapter.getStateAsync(id);
        if (!ids) ids = [];
        ids.push(id);
      }
      for (let i in ids) {
        let id = ids[i];
        let idtype = id.split('.').slice(0, -1).join('.') + '.type';
        let statusname = id.split('.').slice(-1).join('.');
        let state = await this.adapter.getStateAsync(idtype);
        if (state && state.val) {
          let type = state.val;
          let parameter = copyObject(this.getDatapointDeviceList(type, statusname));
          if (!parameter || Object.keys(parameter).length == 0) {
            await this.adapter.delObjectAsync(id);
            this.adapter.log.debug('Delete old object ' + id);
          } else {
            let obj = await this.adapter.getObjectAsync(id);
            if (obj && obj.common && obj.common.name) parameter.name = obj.common.name; // Name kopieren
            if (!propertiesObjAinObjB(parameter, obj.common)) {
              obj.common = parameter;
              await this.adapter.extendObjectAsync(id, obj);
              this.adapter.log.debug('Changed parameters for object ' + id);
            }
          }
        }
      }
    } catch (error) {
      //
    }
  }

  setProcess(name, polltime) {
    this.process[name] = {
      obj: new proc.Process(this.adapter, polltime),
      polltime: polltime
    };
    return this.getProcess(name);
  }

  getProcess(name) {
    return this.process[name];
  }

  /**
     * Add process to array
     * @param {function} funct - function to add to queue
     * @param {number} prio - priority, 1 ist highest
     * @param {boolen} loop - if true, after proccessing the function will add to queue againg
     */
  async addToProcess(funct, object, name, polltime) {
    let process = this.getProcess(name);
    if (!process) process = this.setProcess(name, polltime);
    return process.obj.addToProcess(funct, object);
  }

  /**
   * 
   * @param {string} key - identifier to delete
   */
  async delFromProcess(key, name) {
    let process = this.getProcess(name);
    return process.obj.delFromProcess(key);
  }

  /**
   * get Token
   */
  async getToken(newtoken) {
    // try {
    if (!this.token || !this.token.token || newtoken || Math.abs(getNow() - this.token.time) > this.tokentimeout) {
      let token;
      let opt = {
        url: this.getURL(urlTokenGet),
        rejectUnauthorized: false,
        timeout: 30 * 1000,
        headers: {
          'Authorization': this.auth
        }
      };
      this.adapter.log.debug('Starting Token Request in getToken');
      this.adapter.log.debug('Form of getToken (' + urlTokenGet + ') : ' + JSON.stringify(opt));
      let body = await request.get(opt);
      if (body) {
        body = this.delSonderzeichen(body);
        body = JSON.parse(body);
        token = body.message;
        this.adapter.log.debug('TokenGet : ' + JSON.stringify(body));
      }
      // await this.setPollSecOk();
      this.token.token = token;
      this.token.time = getNow();
    }
    return this.token.token;
    /*  
    } catch (error) {
      this.adapter.log.error('Error in getToken : ' + error); // error in the above string (in this case, yes)!
      await this.setPollSecError();
      throw new Error('Set Polltime');
    }
    */
  }

  async deviceGenericPost(url, form) {
    try {
      if (!await this.isPollingAlloed()) return;
      let token = await this.getToken();
      let opt = {
        url: this.getURL(url),
        rejectUnauthorized: false,
        timeout: 30 * 1000,
        headers: {
          'Authorization': this.auth,
          'X-Token': token
        }
      };
      if (form) opt.form = form;
      this.adapter.log.debug('Form of deviceGenericPost (' + url + ') : ' + JSON.stringify(opt));
      let body = await request.post(opt);
      if (body) {
        body = this.delSonderzeichen(body);
        body = JSON.parse(body);
        this.adapter.log.debug('Result of deviceGenericPost (' + url + ') : ' + JSON.stringify(body));
      }
      await this.setPollSecOk();
      if (body.result === 0) {
        switch (body.message) {
          case '{WEB_ERR_FORBIDDEN}':
            this.adapter.log.error('Authentication error in deviceGenericPost (' + url + ')');
            break;
          default:
            break;
        }
      }
      return body;
    } catch (error) {
      // if (error && error.error) await this.setPollSecError('Error in deviceGenericPost (' + url + ') : ' + error);
      if (form && form.id) url = url + ' - ' + form.id;
      if (form && form.sid) url = url + ' - ' + form.sid;
      if (error && error.error && error.error.code !== 'ESOCKETTIMEDOUT' && error.error.code !== 'ETIMEDOUT') {
        await this.setPollSecError('Error in deviceGenericPost (' + url + ') : ' + error);
      } else {
        this.adapter.log.debug('Error in deviceGenericPost (' + url + ') : ' + error);
      }
    }
  }

  async deviceGenericGet(url, form) {
    try {
      if (!await this.isPollingAlloed()) return;
      let opt = {
        url: this.getURL(url),
        rejectUnauthorized: false,
        timeout: 30 * 1000,
        headers: {
          'Authorization': this.auth
        }
      };
      if (form) opt.form = form;
      this.adapter.log.debug('Form of deviceGenericGet (' + url + ') : ' + JSON.stringify(opt));
      let body = await request.get(opt);
      if (body) {
        body = this.delSonderzeichen(body);
        body = JSON.parse(body);
        this.adapter.log.debug('Result of deviceGenericGet (' + url + ') : ' + JSON.stringify(body));
      }
      await this.setPollSecOk();
      if (body.result === 0) {
        switch (body.message) {
          case '{WEB_ERR_FORBIDDEN}':
            this.adapter.log.error('Authentication error in deviceGenericGet (' + url + ')');
            break;
          default:
            break;
        }
      }
      return body;
    } catch (error) {
      // if (error && error.error) await this.setPollSecError('Error in deviceGenericGet (' + url + ') : ' + error);
      if (error && error.error && error.error.code !== 'ESOCKETTIMEDOUT' && error.error.code !== 'ETIMEDOUT') {
        await this.setPollSecError('Error in deviceGenericGet (' + url + ') : ' + error);
      } else {
        this.adapter.log.debug('Warninng in deviceGenericGet (' + url + ') : ' + error);
      }
    }
  }

  async deviceSwitchDimmerPost(form) {
    let body = await this.deviceGenericPost(urlDeviceSwitchDimmerPost, form);
    let result = body ? body.result : undefined;
    return result;
  }

  async deviceHueColorControl(form) {
    let body = await this.deviceGenericPost(urlDeviceHueColorControl, form);
    let result = body ? body.result : undefined;
    return result;
  }

  /**
    * 
    * @param {*} form - { exec: a=1&z=36&nuki=02 } or { exec: a=1&z=11&sw=on&pd=} 
    * @returns 
    */
  async haExecutePost(form) {
    let body = await this.deviceGenericPost(urlHaExecutePost, form);
    let result = body ? body.result : undefined;
    return result;
  }

  /**
   * Switch on or off
   * @param {object} form - { id: 'ZS:b12d01', switch: 1 } switch can be 0 or 1
   */
  async deviceSwitchPSSPost(form) {
    let body = await this.deviceGenericPost(urlDeviceSwitchPSSPost, form);
    let result = body ? body.result : undefined;
    return result;
  }

  async deviceEditShutterPost(form) {
    let body = await this.deviceGenericPost(urlDeviceEditShutterPost, form);
    let result = body ? body.result : undefined;
    return result;
  }

  async deviceEditThermoPost(form) {
    let body = await this.deviceGenericPost(urlDeviceEditThermoPost, form);
    let result = body ? body.result : undefined;
    return result;
  }

  async deviceEditMeterPost(form) {
    let body = await this.deviceGenericPost(urlDeviceEditMeterPost, form);
    let result = body ? body.result : undefined;
    return result;
  }

  async panelCondPost(form) {
    let body = await this.deviceGenericPost(urlPanelCondPost, form);
    let result = body ? body.result : undefined;
    return result;
  }

  async deviceNukiCmd(form) {
    let body = await this.deviceGenericPost(urlDeviceNukiCmd, form);
    let result = body ? body.result : undefined;
    return result;
  }

  /**
   * DeviceEditPost
   * @param {object} form - { id: 'zx23424', param1: 'parameter 1', , param2: 'parameter 2'}
   */
  async deviceEditPost(form) {
    let formget = {
      id: form.id
    };
    let body = await this.deviceEditGet(formget);
    if (body && body.forms && body.forms.ssform && !isEmpty(body.forms.ssform)) {
      let ssform = body.forms.ssform;
      if (this.isEqualGetPostRequest('deviceEditPost_' + form.id, ssform)) {
        return ssform;
      }
      for (let name in ssform) {
        let value = ssform[name];
        // value = this.convStringNumber(value);
        if (!form.hasOwnProperty(name)) {
          switch (typeof value) {
            case 'string':
              if (value.length > 0) form[name] = value;
              break;
            default:
              if (value) form[name] = value;
              break;
          }
        }
      }
      // await sleep(100);
      body = await this.deviceGenericPost(urlDeviceEditPost, form);
      let result = body ? body.result : undefined;
      return result;
    }
  }

  /**
   * Logout
   */
  async logoutPost() {
    let body = await this.deviceGenericPost(urlLogoutPost);
    let result = body ? body.result : undefined;
    return result;
  }

  /**
   * DeviceEditGet
   * @param {object} form - { id: 'zx122345' }
   */
  async deviceEditGet(form) {
    let body = await this.deviceGenericPost(urlDeviceEditGet, form);
    return body;
  }

  async deviceeEditGetStatus(object) {
    let deviceid = 'devices';
    let promises = [];
    let newstates = {};
    if (object && Object.prototype.toString.call(object) === '[object Object]') {
      await this.setObjectOrUpdate(deviceid, {
        type: 'device',
        common: {
          name: 'Devices Alarmanlage',
          icon: '/icons/zentrale.png'
        },
        native: {}
      });
      let id = object.id;
      let type = object.stype || await this.getState('devices.' + id + '.type');
      let icon = this.getIcon(type) || '';
      let name = object.sname || await this.getState('devices.' + id + '.name');
      let channelid = deviceid + '.' + id;
      if (id && type >= 0) this.setTypeById(id, type);
      await this.setObjectOrUpdate(channelid, {
        type: 'channel',
        common: {
          name: name,
          icon: icon
        },
        native: {}
      });
      for (let statusname in object) {
        // do not change value, becaue it will be updated 
        if (this.getCallByDelayObj(id, statusname)) {
          continue;
        }
        let statusvalue = object[statusname];
        statusvalue = this.convStringNumber(statusvalue);
        if (type === 37 || type === 17) {
          if (statusname === 'sresp_panic') statusname = 'sresp_button_123';
          if (statusname === 'sresp_fire') statusname = 'sresp_button_456';
          if (statusname === 'sresp_medical') statusname = 'sresp_button_789';
        }
        if (statusname === 'thermo_offset') {
          statusvalue = round((statusvalue / 10), 0.5);
        }
        if (statusname === 'on_time' || statusname === 'off_time') {
          statusvalue = round((statusvalue / 10), 0.1);
        }

        let statusid = channelid + '.' + statusname;
        // anzupassende Status ersteinmal im Objekt speichern
        newstates[statusname] = {
          statusid: statusid, // device.RFxxxxx.status
          statusname: statusname, // status
          statusvalue: statusvalue, // 1
          devicename: name, // Wohnzimmer Türsensor
          devicetype: type // 48
        };
      }
      // Set states
      for (let statusname in newstates) {
        let newstate = newstates[statusname];
        if (newstate.statusname === 'type') continue; // electric power meter (type 50) sends empty value for type. state type has not to be set here again   
        let parameter = copyObject(this.getDatapointDeviceList(newstate.devicetype, newstate.statusname));
        if (parameter) {
          let statusvalue = newstate.statusvalue;
          let stateid = newstate.statusid;
          let type = getPropertyType(statusvalue);
          if (type == 'object') statusvalue = '{' + statusvalue.toString() + '}';
          if (type == 'array') statusvalue = '[' + statusvalue.toString() + ']';
          // falls Type anders als Value, dann anpassen.
          if (parameter.type == 'boolean' && parameter.type != type) {
            if (statusvalue == '' || statusvalue == 0 || statusvalue == null) {
              statusvalue = false;
            } else {
              statusvalue = true;
            }
          }
          // parameter.name = name + ' ' + (parameter.name || '');
          parameter.name = parameter.name ? name + ' (' + parameter.name + ')' : name;
          parameter.icon = icon;
          promises.push(this.setObjectOrUpdate(stateid, {
            type: 'state',
            common: parameter,
            native: {}
          }, statusvalue, true));
        }
        // self.setStateForDevice(newstate.statusid, newstate.statusname, newstate.statusvalue, newstate.devicename, newstate.devicetype, newstate.ts);
      }
    }
    await this.promiseAll(promises);
  }


  /**
   * DeviceEditAllGet
   */
  async deviceEditAllGet() {
    let result = {};
    let deviceid = 'devices';
    try {
      let body = await this.systemGet({});
      if (!body || (body && Object.keys(body).length) === 0) return;
      let channels = await this.adapter.getChannelsOfAsync(deviceid);
      for (let c = 0; c < channels.length; c++) {
        let id = channels[c]._id.split('.').slice(-1).join('.');
        let form = {
          id: id
        };
        // await sleep(100);
        let body = await this.deviceEditGet(form);
        if (body && body.forms && body.forms.ssform && !isEmpty(body.forms.ssform)) {
          let ssform = body.forms.ssform;
          if (this.isEqualGetPostRequest('deviceEditAllGet_' + id, ssform)) {
            result[id] = ssform;
            continue;
          }
          await this.deviceeEditGetStatus(ssform);
          result[id] = ssform;
        }
        // }
      }
      return result;
    } catch (error) {
      this.adapter.log.error('Fehler in funciton DeviceEditGet: ' + error);
    }
  }

  /**
   * Get Info for thermostat
   * @param {object} form - { id: 'RF:xyzdfadf' } - Id of thermostat
   */
  async deviceEditShutterGet(form) {
    let body = await this.deviceGenericPost(urlDeviceEditShutterGet, form);
    return body;
  }

  /**
   * Get Info for thermostat
   * @param {object} form - { id: 'RF:xyzdfadf' } - Id of thermostat
   */
  async deviceEditThermoGet(form) {
    let body = await this.deviceGenericPost(urlDeviceEditThermoGet, form);
    return body;
  }

  /**
   * Get Info for powermeter
   * @param {object} form - { id: 'RF:xyzdfadf' } - Id of powermeter
   */
  async deviceEditMeterGet(form) {
    let body = await this.deviceGenericPost(urlDeviceEditMeterGet, form);
    return body;
  }

  async deviceAllGet() {
    let result = {};
    let deviceid = 'devices';
    try {
      let channels = await this.adapter.getChannelsOfAsync(deviceid);
      for (let c = 0; c < channels.length; c++) {
        let type = await this.getState(channels[c]._id + '.type');
        let id = channels[c]._id.split('.').slice(-1).join('.');
        let form = {
          id: id
        };
        if (type === 50) {
          let body = await this.deviceEditMeterGet(form);
          if (body && body.forms && body.forms.meterform && !isEmpty(body.forms.meterform)) {
            let meterform = body.forms.meterform;
            if (this.isEqualGetPostRequest('deviceEditMeterGet_' + id, meterform)) {
              result[id] = meterform;
              continue;
            }
            await this.deviceeEditGetStatus(meterform);
            result[id] = meterform;
          }
        }
        if (type === 79) {
          let body = await this.deviceEditThermoGet(form);
          if (body && body.forms && body.forms.thermoform && !isEmpty(body.forms.thermoform)) {
            let thermoform = body.forms.thermoform;
            if (this.isEqualGetPostRequest('deviceEditThermoGet_' + id, thermoform)) {
              result[id] = thermoform;
              continue;
            }
            await this.deviceeEditGetStatus(thermoform);
            result[id] = thermoform;
          }
        }
        if (type === 76) {
          let body = await this.deviceEditShutterGet(form);
          if (body && body.forms && body.forms.shutterform && !isEmpty(body.forms.shutterform)) {
            let shutterform = body.forms.shutterform;
            if (this.isEqualGetPostRequest('deviceEditShutterGet_' + id, shutterform)) {
              result[id] = shutterform;
              continue;
            }
            await this.deviceeEditGetStatus(shutterform);
            result[id] = shutterform;
          }
        }
      }
      return result;
    } catch (error) {
      this.adapter.log.error('Fehler in funciton DeviceEditGet: ' + error);
    }
  }


  /**
   * Get Camera Information
   */
  async ipCamGet() {
    let body = await this.deviceGenericGet(urlIpcamGet);
    let ipcamform = {};
    if (body && body.forms && body.forms.ipcamform && !isEmpty(body.forms.ipcamform)) {
      ipcamform = body.forms.ipcamform;
      if (this.isEqualGetPostRequest('ipCamGet', ipcamform)) {
        return ipcamform;
      }
    }
    return ipcamform;
  }

  async systemGet(form) {
    let body = await this.deviceGenericGet(urlSystemGet, form);
    let sysform;
    if (body && body.forms && body.forms.sysform && !isEmpty(body.forms.sysform)) {
      sysform = body.forms.sysform;
      if (this.isEqualGetPostRequest('systemGet', sysform)) {
        return sysform;
      }
    }
    return sysform;
  }


  async deviceListeDeleteOldStates(objects) {
    let devices = [];
    devices = await this.getAllDevices();
    for (let devicename in objects) {
      let device = objects[devicename];
      let id;
      if (device.sid || device.id) {
        id = device.sid ? device.sid : device.id;
      } else {
        continue;
      }
      if (id && devices[id]) delete devices[id];
    }
    await this.deleteDevices(devices);
  }

  /**
   * DeviceGetList & DevicePSSGetList
   * @param {*} object 
   */
  async deviceListDevicePSSListSetStatus(object) {
    let deviceid = 'devices';
    let promises = [];
    await this.setObjectOrUpdate(deviceid, {
      type: 'device',
      common: {
        name: 'Devices Alarmanlage',
        icon: '/icons/zentrale.png'
      },
      native: {}
    });
    for (let devicename in object) {
      let device = object[devicename];
      if (Object.prototype.toString.call(device) !== '[object Object]') continue;
      let channelid;
      let icon = this.getIcon(device.type) || '';
      let newstates = {};
      let id;
      let area;
      let zone;

      if (device.sid || device.id) {
        id = device.sid ? device.sid : device.id;
        channelid = deviceid + '.' + id;
        this.setTypeById(id, device.type);
      } else {
        this.adapter.log.error('DeviceListDevicePSSListSetStatus : ID missing');
        continue;
      }
      await this.setObjectOrUpdate(channelid, {
        type: 'channel',
        common: {
          name: device.name,
          icon: icon
        },
        native: {}
      });

      for (let statusname in device) {
        // do not change value, becaue it will be updated 
        if (this.getCallByDelayObj(id, statusname)) {
          continue;
        }
        let statusvalue = device[statusname];
        statusvalue = this.convStringNumber(statusvalue);
        let statusid = channelid + '.' + statusname;
        //  Aus '{WEB_MSG_DC_CLOSE} or '{WEB_MSG_DC_OPEN} wird CLOSE bzw. OPEN
        if (statusname === 'status' && statusvalue) {
          const regstat = /\{WEB_MSG_(DC|DL)_(.+)\}/gm;
          let m = regstat.exec(statusvalue);
          if (m && m.length > 1) {
            statusvalue = m[2]; // .toLowerCase();
          }
        }

        // zustätzlicher Status einführen (alarm_statu_ex). This value will be true/false
        if (statusname === 'alarm_status') {
          let tmpname = statusname + '_ex';
          let tmpid = channelid + '.' + tmpname;
          let tmpvalue = statusvalue ? true : false;
          newstates[tmpname] = {
            statusid: tmpid, // device.RFxxxxx.status
            statusname: tmpname, // status
            statusvalue: tmpvalue, // 1
            devicename: device.name, // Wohnzimmer Türsensor
            devicetype: device.type // 48
          };
        }

        // Set TYPE Name like Türkontakt or Keypad
        if (statusname === 'type') {
          let type = this.getTypeList(statusvalue) || {};
          if (type) {
            let tmpname = statusname + '_name';
            let tmpid = channelid + '.' + tmpname;
            let tmpvalue = type.name;
            newstates[tmpname] = {
              statusid: tmpid, // device.RFxxxxx.status
              statusname: tmpname, // status
              statusvalue: tmpvalue, // 1
              devicename: device.name, // Wohnzimmer Türsensor
              devicetype: device.type // 48
            };
          }
        }

        // For Power Switches, 2 new States
        if (statusname === 'rssi') {
          let reg = /\{WEB_MSG_(.+)\}(.*)/gm;
          let m = reg.exec(statusvalue);
          let rssi = 0;
          if (m) {
            // rssitxt = m[1].trim();
            rssi = m[2] ? m[2].trim() : 0;
            statusvalue = Number(rssi);
          }
        }

        // Raumsensor / Temperatursensor mit Display , 2 new States
        if (statusname === 'status' && device.type === 20) {
          let reg = /\{WEB_MSG_TS_DEGREE\}(.+)/gm;
          let m = reg.exec(statusvalue);
          let actualtemperature = 0;
          let actualhumidity = 0;
          let tmpname;
          let tmpid;
          if (m) {
            actualtemperature = Number(m[1].trim());
            tmpname = 'actual_temperature';
            tmpid = channelid + '.' + tmpname;
            newstates[tmpname] = {
              statusid: tmpid, // device.RFxxxxx.status
              statusname: tmpname, // status
              statusvalue: actualtemperature, // 1
              devicename: device.name, // Wohnzimmer Türsensor
              devicetype: device.type
            };
          }
        }

        // For Power Switches, 2 new States
        if (statusname === 'status' && (device.type === 48 || device.type === 50)) {
          let reg = /\{WEB_MSG_PSM_POWER\}(.+)\{WEB_MSG_POWER_METER_ENERGY\}(.+)/gm;
          let m = reg.exec(statusvalue);
          let power = 0;
          let powertotal = 0;
          let tmpname;
          let tmpid;
          if (m) {
            power = Number(m[1].trim());
            powertotal = Number(m[2].trim());
            tmpname = 'power';
            tmpid = channelid + '.' + tmpname;
            newstates[tmpname] = {
              statusid: tmpid, // device.RFxxxxx.status
              statusname: tmpname, // status
              statusvalue: power, // 1
              devicename: device.name, // Wohnzimmer Türsensor
              devicetype: device.type
            };
            tmpname = 'powertotal';
            tmpid = channelid + '.' + tmpname;
            newstates[tmpname] = {
              statusid: tmpid, // device.RFxxxxx.status
              statusname: tmpname, // status
              statusvalue: powertotal, // 1
              devicename: device.name, // Wohnzimmer Türsensor
              devicetype: device.type
            };
          }
        }

        // Raumsensor / Temperatursensor mit Display , 2 new States
        if (statusname === 'status' && device.type === 54) {
          let reg = /\{WEB_MSG_TS_DEGREE\}(.+)\{WEB_MSG_RH_HUMIDITY\}(.+)/gm;
          let m = reg.exec(statusvalue);
          let actualtemperature = 0;
          let actualhumidity = 0;
          let tmpname;
          let tmpid;
          if (m) {
            actualtemperature = Number(m[1].trim());
            actualhumidity = Number(m[2].trim());
            tmpname = 'actual_temperature';
            tmpid = channelid + '.' + tmpname;
            newstates[tmpname] = {
              statusid: tmpid, // device.RFxxxxx.status
              statusname: tmpname, // status
              statusvalue: actualtemperature, // 1
              devicename: device.name, // Wohnzimmer Türsensor
              devicetype: device.type
            };
            tmpname = 'actual_humidity';
            tmpid = channelid + '.' + tmpname;
            newstates[tmpname] = {
              statusid: tmpid, // device.RFxxxxx.status
              statusname: tmpname, // status
              statusvalue: actualhumidity, // 1
              devicename: device.name, // Wohnzimmer Türsensor
              devicetype: device.type
            };
          }
        }

        // Nuki
        if (statusname === 'nuki' && device.type === 57) {
          let tmpname = 'nuki_state';
          let tmpid = channelid + '.' + tmpname;
          let tmpdoorsensor = this.adapter.config.nuki_doorsensor; // deviceid + '.' + 'RF:XXXXXXXX.status_ex';
          let doorstatus = await this.getState(tmpdoorsensor);
          if (statusvalue === 3 && doorstatus === true) statusvalue = 0; // unlocked and door ist open       
          newstates[tmpname] = {
            statusid: tmpid, // device.RFxxxxx.status
            statusname: tmpname, // Nuki
            statusvalue: statusvalue, // 1
            devicename: device.name, // Türschloss
            devicetype: device.type
          };
          let oldstatus = await this.getState(tmpid);
          if (oldstatus === undefined) {
            tmpname = 'nuki_action'; // state nuki will be renamed to nuki_action
            tmpid = channelid + '.' + tmpname;
            oldstatus = oldstatus !== statusvalue ? statusvalue : undefined;
            newstates[tmpname] = {
              statusid: tmpid, // device.RFxxxxx.status
              statusname: tmpname, // Nuki
              statusvalue: oldstatus, // 1
              devicename: device.name, // Türschloss
              devicetype: device.type
            };
          }
        }

        // Lichtsensor
        if (statusname === 'status' && device.type === 78) {
          if (statusvalue.startsWith('{WEB_MSG_TS_DEGREE}')) {
            let reg = /\{WEB_MSG_TS_DEGREE\}(.+)\{WEB_MSG_RH_HUMIDITY\}(.+)\{WEB_MSG_LM_LUX\}(.+)/gm;
            let m = reg.exec(statusvalue);
            let actualtemperature = 0;
            let actualhumidity = 0;
            let actuallux = 0;
            let tmpname;
            let tmpid;
            if (m) {
              actualtemperature = Number(m[1].trim());
              actualhumidity = Number(m[2].trim());
              actuallux = Number(m[3].trim());
              tmpname = 'actual_temperature';
              tmpid = channelid + '.' + tmpname;
              newstates[tmpname] = {
                statusid: tmpid, // device.RFxxxxx.status
                statusname: tmpname, // status
                statusvalue: actualtemperature, // 1
                devicename: device.name, // Wohnzimmer Türsensor
                devicetype: device.type
              };
              tmpname = 'actual_humidity';
              tmpid = channelid + '.' + tmpname;
              newstates[tmpname] = {
                statusid: tmpid, // device.RFxxxxx.status
                statusname: tmpname, // status
                statusvalue: actualhumidity, // 1
                devicename: device.name, // Wohnzimmer Türsensor
                devicetype: device.type
              };
              tmpname = 'actual_lux';
              tmpid = channelid + '.' + tmpname;
              newstates[tmpname] = {
                statusid: tmpid, // device.RFxxxxx.status
                statusname: tmpname, // status
                statusvalue: actuallux, // 1
                devicename: device.name, // Wohnzimmer Türsensor
                devicetype: device.type
              };
            }
          }
          if (statusvalue.startsWith('{WEB_MSG_LM_LUX}')) {
            let reg = /\{WEB_MSG_LM_LUX\}(.+)/gm;
            let m = reg.exec(statusvalue);
            let actuallux = 0;
            let tmpname;
            let tmpid;
            if (m) {
              actuallux = Number(m[1].trim());
              tmpname = 'actual_lux';
              tmpid = channelid + '.' + tmpname;
              newstates[tmpname] = {
                statusid: tmpid, // device.RFxxxxx.status
                statusname: tmpname, // status
                statusvalue: actuallux, // 1
                devicename: device.name, // Wohnzimmer Türsensor
                devicetype: device.type
              };
            }
          }
        }

        // Psuedo Status PD 
        if (statusname === 'status_ex' && (device.type === 24 || device.type === 48)) {
          let tmpname = 'pd';
          let tmpid = channelid + '.' + tmpname;
          newstates[tmpname] = {
            statusid: tmpid, // device.RFxxxxx.status
            statusname: tmpname, // pd
            statusvalue: undefined, // 1
            devicename: device.name, // Wohnzimmer Türsensor
            devicetype: device.type
          };
        }

        // Schalter für An/Aus Hue Lampe und Dimmmer
        if (statusname === 'status_ex' && (device.type === 74 || device.type === 66)) {
          let reg;
          let m;
          let tmpname;
          let tmpval;
          // Wert von Status lesen
          tmpname = 'status';
          tmpval = device[tmpname];
          // Auto / Manueller Mode
          reg = /\{WEB_MSG_DIMMER_(ON|OFF)\}/gm;
          m = reg.exec(tmpval);
          statusvalue = false;
          if (m) {
            if (m[1].trim() == 'OFF') {
              statusvalue = false; // off
            } else {
              statusvalue = true; // on
            }
          }
        }

        // Shutter, if shutter level (0-100%) change, the swich value will change too
        if (statusname === 'level' && device.type === 76) {
          let tmpname;
          let tmpid;
          let vswitch = 2; // stop
          // alten bzw. vorherigen Wert lesen
          tmpname = 'level';
          tmpid = channelid + '.' + tmpname;
          try {
            let state = await this.adapter.getStateAsync(tmpid);
            if (state) {
              if (statusvalue != state.val) {
                //  statusvalue > state.val (100 > 10), shutter open (1)
                //  statusvalue < state.val (10 > 100), shutter close (0)
                vswitch = statusvalue > state.val ? 1 : 0;
              }
            }
          } catch (error) {
            //
          }
          tmpname = 'switch';
          tmpid = channelid + '.' + tmpname;
          newstates[tmpname] = {
            statusid: tmpid, // device.RFxxxxx.status
            statusname: tmpname, // status
            statusvalue: vswitch, // 1
            devicename: device.name, // Wohnzimmer Türsensor
            devicetype: device.type
          };
        }

        // For Thermostate new States
        if (statusname === 'status' && device.type === 79) {
          let reg;
          let m;
          let actualtemperature = 0;
          let settemperature = 0;
          let valve = 0;
          let mode = 0;
          let off = false;
          let tmpname;
          let tmpid;
          // Ist Termperatur
          reg = /\{WEB_MSG_TS_DEGREE\}\s*([\d.]+)/gm;
          m = reg.exec(statusvalue);
          actualtemperature = 0;
          if (m) {
            actualtemperature = Number(m[1].trim());
          }
          tmpname = 'actual_temperature';
          tmpid = channelid + '.' + tmpname;
          newstates[tmpname] = {
            statusid: tmpid, // device.RFxxxxx.status
            statusname: tmpname, // status
            statusvalue: actualtemperature, // 1
            devicename: device.name, // Wohnzimmer Türsensor
            devicetype: device.type
          };
          // Ventilstellung
          reg = /\{WEB_MSG_TRV_VALVE\}\s*([\d.]+)/gm;
          m = reg.exec(statusvalue);
          valve = 0;
          if (m) {
            valve = Number(m[1].trim());
          }
          tmpname = 'valve';
          tmpid = channelid + '.' + tmpname;
          newstates[tmpname] = {
            statusid: tmpid, // device.RFxxxxx.status
            statusname: tmpname, // status
            statusvalue: valve, // 1
            devicename: device.name, // Wohnzimmer Türsensor
            devicetype: device.type
          };
          // Soll Termperatur
          reg = /\{WEB_MSG_TRV_SETPOINT\}\s*([\d.]+)/gm;
          m = reg.exec(statusvalue);
          settemperature = 0;
          if (m) {
            settemperature = Number(m[1].trim());
          }
          tmpname = 'set_temperature';
          tmpid = channelid + '.' + tmpname;
          newstates[tmpname] = {
            statusid: tmpid, // device.RFxxxxx.status
            statusname: tmpname, // status
            statusvalue: settemperature, // 1
            devicename: device.name, // Wohnzimmer Türsensor
            devicetype: device.type
          };
          // Auto / Manueller Mode
          reg = /\{WEB_MSG_TRV_(AUTO|MANUAL)\}/gm;
          m = reg.exec(statusvalue);
          mode = 0;
          if (m) {
            if (m[1].trim() == 'MANUAL') {
              mode = 0; // manuell
            } else {
              mode = 1; // automatic
            }
          }
          tmpname = 'mode';
          tmpid = channelid + '.' + tmpname;
          newstates[tmpname] = {
            statusid: tmpid, // device.RFxxxxx.status
            statusname: tmpname, // status
            statusvalue: mode, // 1
            devicename: device.name, // Wohnzimmer Türsensor
            devicetype: device.type
          };
          // Heizung aus
          reg = /\{WEB_MSG_TRV_(OFF)\}/gm;
          m = reg.exec(statusvalue);
          off = false;
          if (m) {
            if (m[1].trim() == 'OFF') {
              off = true;
            }
          }
          tmpname = 'off';
          tmpid = channelid + '.' + tmpname;
          newstates[tmpname] = {
            statusid: tmpid, // device.RFxxxxx.status
            statusname: tmpname, // status
            statusvalue: off, // 1
            devicename: device.name, // Wohnzimmer Türsensor
            devicetype: device.type
          };
        }

        if (statusname === 'zone') {
          zone = statusvalue;
        }

        if (statusname === 'area') {
          area = statusvalue;
        }

        // anzupassende Status ersteinmal im Objekt speichern
        newstates[statusname] = {
          statusid: statusid, // device.RFxxxxx.status
          statusname: statusname, // status
          statusvalue: statusvalue, // 1
          devicename: device.name, // Wohnzimmer Türsensor
          devicetype: device.type // 48
        };
      }

      // Set states
      for (let statusname in newstates) {
        let newstate = newstates[statusname];
        let parameter = copyObject(this.getDatapointDeviceList(newstate.devicetype, newstate.statusname));
        if (newstate.statusname == 'status_ex' && await this.getState(newstate.statusid.split('.').slice(0, -1).join('.') + '.always_off') === 1)
          parameter.role = 'button';
        let statusvalue = newstate.statusvalue;
        let stateid = newstate.statusid;
        let type = getPropertyType(statusvalue);
        if (type == 'object') statusvalue = '{' + statusvalue.toString() + '}';
        if (type == 'array') statusvalue = '[' + statusvalue.toString() + ']';
        if (parameter) {
          // falls Type anders als Value, dann anpassen.
          if (parameter.type == 'boolean' && parameter.type != type) {
            if (statusvalue == '' || statusvalue == 0 || statusvalue == null) {
              statusvalue = false;
            } else {
              statusvalue = true;
            }
          }
          // parameter.name = device.name + ' ' + (parameter.name || '');
          parameter.name = parameter.name ? device.name + ' (' + parameter.name + ')' : device.name;
          parameter.icon = icon;
          promises.push(this.setObjectOrUpdate(stateid, {
            type: 'state',
            common: parameter,
            native: {}
          }, statusvalue, true));
        }
        // self.setStateForDevice(newstate.statusid, newstate.statusname, newstate.statusvalue, newstate.devicename, newstate.devicetype, newstate.ts);
      }
    }
    await this.promiseAll(promises);
  }

  hashcode(s) {
    return s.split('').reduce((a, b) => (((a << 5) - a) + b.charCodeAt(0)) | 0, 0);
  }

  isEqualGetPostRequest(id, obj) {
    if (this.adapter.config.alarm_equal) return false;
    let objString = this.hashcode(JSON.stringify(obj)); // JSON.stringify(obj);
    if (this.states[id] === objString) {
      return true;
    }
    this.states[id] = objString;
    return false;
  }

  async devicePSSListGet() {
    let body = await this.deviceGenericGet(urlDevicePSSListGet);
    let pssrows;
    if (body && body.pssrows && !isEmpty(body.pssrows)) {
      pssrows = body.pssrows;
      if (this.isEqualGetPostRequest('devicePSSListGet', pssrows)) {
        return pssrows;
      }
      await this.deviceListDevicePSSListSetStatus(pssrows);
    }
    return pssrows;
  }

  async deviceListUPICStatus(object) {
    let promises = [];
    let deviceid = 'devices';
    let modes = {
      1: [17, 18, 19, 20, 21, 22, 23, 24],
      2: [33, 34, 35, 36, 37, 38, 39, 40],
      3: [49, 50, 51, 52, 53, 54, 55, 56],
      4: [65, 66, 67, 68, 69, 70, 71, 72],
      5: [81, 82, 83, 84, 85, 86, 87, 88]
    };
    await this.setObjectOrUpdate(deviceid, {
      type: 'device',
      common: {
        name: 'Devices Alarmanlage',
        icon: '/icons/zentrale.png'
      },
      native: {}
    });
    for (let devicename in object) {
      let device = object[devicename];
      let icon = this.getIcon(device.type) || '';
      let id = device.id;
      let channelid = deviceid + '.' + id;
      await this.setObjectOrUpdate(channelid, {
        type: 'channel',
        common: {
          name: device.name,
          icon: icon
        },
        native: {}
      });
      for (let a = 1; a <= 5; a++) {
        let appliance = 'appliance_' + a;
        let valAppliance = device[appliance] || 'Appliance ' + a;
        let applianceid = channelid + '.' + appliance;
        await this.setObjectOrUpdate(applianceid, {
          type: 'channel',
          common: {
            name: device.name + ' (' + valAppliance + ')',
            icon: icon
          },
          native: {}
        });
        for (let m = 1; m <= 8; m++) {
          let mode = 'mode_name_' + modes[a][m - 1];
          let valMode = device[mode] || 'Mode ' + m;
          let modeid = applianceid + '.' + mode;
          promises.push(this.setObjectOrUpdate(modeid, {
            type: 'state',
            common: {
              type: 'boolean',
              role: 'button',
              icon: icon,
              name: device.name + ' (' + valMode + ')',
              read: true,
              write: true
            },
            native: {}
          }));
        }
      }
      for (let statename in device) {
        if (statename.startsWith('appliance_')) continue;
        let parameter = copyObject(this.getDatapointDeviceList(device.type, statename));
        if (parameter) {
          let stateid = channelid + '.' + statename;
          let value = device[statename];
          if (statename === 'leds') value = undefined;
          parameter.name = device.name + ' (' + parameter.name + ')';
          parameter.icon = icon;
          promises.push(this.setObjectOrUpdate(stateid, {
            type: 'state',
            common: parameter,
            native: {}
          }, value, true));
        }
      }
      await this.promiseAll(promises);
    }
  }

  async deviceListUPICGet() {
    let body = await this.deviceGenericGet(urlDeviceListUPICGet);
    let upicrows;
    if (body && body.upicrows && !isEmpty(body.upicrows)) {
      upicrows = body.upicrows;
      if (this.isEqualGetPostRequest('deviceListUPICGet', upicrows)) {
        return upicrows;
      }
      await this.deviceListUPICStatus(upicrows);
    }
    return upicrows;
  }


  async deviceListLogsGet(object) {
    let deviceid = 'devices';
    let promises = [];
    let newstates = {};
    if (object && Object.prototype.toString.call(object) === '[object Object]') {
      await this.setObjectOrUpdate(deviceid, {
        type: 'device',
        common: {
          name: 'Devices Alarmanlage',
          icon: '/icons/zentrale.png'
        },
        native: {}
      });
      let id = object.sid;
      let type = object.stype || await this.getState('devices.' + id + '.type');
      let icon = this.getIcon(type) || '';
      let name = object.sname || await this.getState('devices.' + id + '.name');
      let channelid = deviceid + '.' + id;
      if (id && type >= 0) this.setTypeById(id, type);
      await this.setObjectOrUpdate(channelid, {
        type: 'channel',
        common: {
          name: name,
          icon: icon
        },
        native: {}
      });
      for (let statusname in object) {
        // do not change value, becaue it will be updated 
        /*
        if (this.getCallByDelayObj(id, statusname)) {
          continue;
        }
        */
        let statusvalue = object[statusname];
        statusvalue = this.convStringNumber(statusvalue);
        let statusid = channelid + '.' + statusname;
        // anzupassende Status ersteinmal im Objekt speichern
        newstates[statusname] = {
          statusid: statusid, // device.RFxxxxx.status
          statusname: statusname, // status
          statusvalue: statusvalue, // 1
          devicename: name, // Wohnzimmer Türsensor
          devicetype: type // 48
        };
      }
      // Set states
      for (let statusname in newstates) {
        let newstate = newstates[statusname];
        if (newstate.statusname === 'type') continue; // electric power meter (type 50) sends empty value for type. state type has not to be set here again   
        let parameter = copyObject(this.getDatapointDeviceList(newstate.devicetype, newstate.statusname));
        if (parameter) {
          let renew = newstate.statusname == 'logmsg' ? true : false;
          let statusvalue = newstate.statusvalue;
          let stateid = newstate.statusid;
          let type = getPropertyType(statusvalue);
          if (type == 'object') statusvalue = '{' + statusvalue.toString() + '}';
          if (type == 'array') statusvalue = '[' + statusvalue.toString() + ']';
          // falls Type anders als Value, dann anpassen.
          if (parameter.type == 'boolean' && parameter.type != type) {
            if (statusvalue == '' || statusvalue == 0 || statusvalue == null) {
              statusvalue = false;
            } else {
              statusvalue = true;
            }
          }
          // parameter.name = name + ' ' + (parameter.name || '');
          parameter.name = parameter.name ? name + ' (' + parameter.name + ')' : name;
          parameter.icon = icon;
          promises.push(this.setObjectOrUpdate(stateid, {
            type: 'state',
            common: parameter,
            native: {}
          }, statusvalue, true, renew));
        }
        // self.setStateForDevice(newstate.statusid, newstate.statusname, newstate.statusvalue, newstate.devicename, newstate.devicetype, newstate.ts);
      }
    }
    await this.promiseAll(promises);
  }

  async logsGetPost() {
    let logrows;
    let body;
    let form = {
      max_count: 100
    };
    body = await this.deviceGenericPost(urlLogsGet, form);
    if (body && body.logrows && !isEmpty(body.logrows)) logrows = body.logrows;
    for (let l in logrows) {
      let logrow = logrows[l];
      const regex = /{WEB_MSG_DEVICE_AREA_ZONE}[\t\s]*(\d*)[\t\s]*(\d*)/gm;
      let m = regex.exec(logrow.source);
      if (m && m[1] && m[2]) {
        try {
          // alle Objekte lesen
          let actualstates = await this.adapter.getStatesAsync('*');
          const sid = Object.keys(actualstates).find((key) => {
            return (key.endsWith('zone') && actualstates[key].val == m[2] && actualstates[key.replace(/zone$/, 'area')].val == m[1]);
          }).replace(this.adapter.namespace + '.devices.', '').replace('.zone', '');
          let id = this.adapter.namespace + '.devices.' + sid;
          if (actualstates[id + '.logmsg'] && actualstates[id + '.logmsg'].ts >= logrow.log_time * 1000) continue;
          let object = {
            sid: sid,
            time: logrow.log_time,
            area: actualstates[id + '.area'].val,
            zone: actualstates[id + '.zone'].val,
            name: actualstates[id + '.name'].val,
            type: actualstates[id + '.type'].val,
            action: logrow.action,
            logmsg: logrow.msg
          };
          // Something changed, we will update 
          await this.deviceListLogsGet(object);
        } catch (e) {
          // Nothing to do
        }
      }
    }
  }

  async getSMSStatus() {
    let promises = [];
    let deviceid = 'sms';
    await this.setObjectOrUpdate(deviceid, {
      type: 'device',
      common: {
        name: 'SMS',
        icon: '/icons/sms.png'
      },
      native: {}
    });
    let obj = types.dpSMS || {};
    for (let prop in obj) {
      let stateid = deviceid + '.' + prop;
      let value = undefined;
      let parameter = copyObject(obj[prop]) || {};
      promises.push(this.setObjectOrUpdate(stateid, {
        type: 'state',
        common: parameter,
        native: {}
      }, value, true));
    }
    await this.promiseAll(promises);
  }

  async deviceDoUPICPost(form) {
    let body = await this.deviceGenericPost(urlDeviceDoUPICPost, form);
    let result = body ? body.result : undefined;
    return result;
  }

  async sendSMSPost(form) {
    let body = await this.deviceGenericPost(urlSendSMSPost, form);
    let result = body ? body.result : undefined;
    return result;
  }

  async sendSMSgwTestPost(form) {
    let body = await this.deviceGenericPost(urlSmsgwTestPost, form);
    let result = body ? body.result : undefined;
    return result;
  }

  async deviceListGet() {
    let body = await this.deviceGenericGet(urlDeviceListGet);
    let senrows;
    if (body && body.senrows && !isEmpty(body.senrows)) {
      senrows = body.senrows;
      if (this.isEqualGetPostRequest('deviceListGet', senrows)) {
        return senrows;
      }
      await this.deviceListDevicePSSListSetStatus(senrows);
      await this.deviceListeDeleteOldStates(senrows);
    }
    return senrows;
  }

  async panelCondGet() {
    let deviceid = 'status';
    let devicename = 'Status Alarmanlage';
    let objectnew = {};
    let object = await this.deviceGenericGet(urlPanelCondGet);
    let promises = [];
    if (!object) return;
    if (this.isEqualGetPostRequest('panelCondGet', object)) {
      return;
    }
    for (let statusname in object.updates) {
      let status = object.updates[statusname];
      status = this.convStringNumber(status);
      objectnew[statusname] = status;
    }
    for (let statusname in object.forms.pcondform1) {
      let status = object.forms.pcondform1[statusname];
      status = this.convStringNumber(status);
      objectnew[statusname + '_pc_a1'] = status;
    }
    for (let statusname in object.forms.pcondform2) {
      let status = object.forms.pcondform2[statusname];
      status = this.convStringNumber(status);
      objectnew[statusname + '_pc_a2'] = status;
    }
    objectnew.apple_home_a1 = this.getAppleStautusFromLupusec(objectnew.mode_pc_a1, objectnew.alarm_ex);
    objectnew.apple_home_a2 = this.getAppleStautusFromLupusec(objectnew.mode_pc_a2, objectnew.alarm_ex);
    await this.setObjectOrUpdate(deviceid, {
      type: 'device',
      common: {
        name: devicename,
        icon: '/icons/zentrale.png'
      },
      native: {}
    });
    let obj = types.dpStatus || {};
    for (let prop in obj) {
      let stateid = deviceid + '.' + prop;
      let value = objectnew[prop];
      let parameter = copyObject(obj[prop]) || {};
      // parameter = this.setDatapointLanguage(parameter);
      // parameter.name = devicename + ' ' + parameter.name;
      parameter.name = parameter.name ? devicename + ' (' + parameter.name + ')' : devicename;
      promises.push(this.setObjectOrUpdate(stateid, {
        type: 'state',
        common: parameter,
        native: {}
      }, value, true));
    }
    await this.promiseAll(promises);
  }

  /**
   * Get webcam streams from Lupusec
   *  'https://192.168.20.20/action/passthru?cam=2&cmd=webcam.php&usr=webcam&pwd=Cam1968!&cam=2'
   *  'https://192.168.20.20/action/passthru?cam=1&cmd=webcam/cam2.mjpg'
   */
  async getWebcamSnapshots() {
    let deviceid = 'webcams';
    let devicename = 'Webcams Alarmanlage';
    let icon = '/icons/webcam.png';
    let promises = [];
    let port = this.adapter.config.webcam_port;
    let bind = this.adapter.config.webcam_bind;
    let host = bind !== '0.0.0.0' ? bind : this.adapter.host;
    if (!this.webcam) this.webcam = new webcam.Webcam(this.adapter, port, bind);
    await this.setObjectOrUpdate(deviceid, {
      type: 'device',
      common: {
        name: devicename,
        icon: icon
      },
      native: {}
    });
    let ipcams = await this.ipCamGet();
    for (let i = 1; i <= 8; i++) {
      let url = ipcams['url' + i] || '';
      let name = ipcams['name' + i] || 'Webcam ' + i;
      let reqid = 'cam' + i;
      let reqstreamname = '/stream/' + reqid;
      let reqimagename = '/image/' + reqid;
      let stateurl = '';
      if (port > 0) {
        if (this.webcams[i] && this.webcams[i].url === url && this.webcams[i].name === name && this.webcam.isRequestExist(reqid)) {
          continue;
        }
        this.webcams[i] = {
          name: name,
          url: url
        };
        let u = uri.parse(url);
        let pathname = u.pathname && u.pathname.length > 0 ? u.pathname.slice(1) : null;
        let query = u.query;
        if (pathname) url = '?cam=' + i + '&cmd=' + pathname;
        if (query) url += '&' + query;
        this.webcam.closeAndDeleteRequest(reqid);
        if (url.length > 0) {
          url = this.getURL(urlPasthru + url);
          let opt = {
            url: url,
            rejectUnauthorized: false,
            headers: {
              'Authorization': this.auth
            }
          };
          this.webcam.addRequestToQueue(opt, reqid);
        }
      } else {
        url = '';
        name = 'Webcam ' + i;
      }
      let channelid = deviceid + '.cam' + i;
      let stateid;
      await this.setObjectOrUpdate(channelid, {
        type: 'channel',
        common: {
          name: name,
          icon: icon
        },
        native: {}
      });
      stateid = channelid + '.stream';
      stateurl = url.length > 0 && port > 0 ? 'http://' + host + ':' + port + reqstreamname : '';
      promises.push(this.setObjectOrUpdate(stateid, {
        type: 'state',
        common: {
          type: 'string',
          role: 'text.url',
          name: name + ' (Stream)',
          icon: icon,
          read: true,
          write: false
        },
        native: {}
      }, stateurl, true));
      stateid = channelid + '.image';
      stateurl = url.length > 0 && port > 0 ? 'http://' + host + ':' + port + reqimagename : '';
      promises.push(this.setObjectOrUpdate(stateid, {
        type: 'state',
        common: {
          type: 'string',
          role: 'text.url',
          icon: icon,
          name: name + ' (Image)',
          read: true,
          write: false
        },
        native: {}
      }, stateurl, true));
    }
    await this.promiseAll(promises);
  }
}


module.exports = {
  Lupus: Lupus
};