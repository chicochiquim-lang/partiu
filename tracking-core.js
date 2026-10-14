/* Transport must enforce ride membership on the server. No position is sent before start(). */
class PartiuTracker {
  constructor({geolocation, transport, now=()=>Date.now(), onStatus=()=>{}, onPosition=()=>{}, intervalMs=5000}) {
    Object.assign(this,{geolocation,transport,now,onStatus,onPosition,intervalMs});
    this.watch=null;this.unsubscribe=null;this.generation=0;this.lastSent=0;this.sending=false;this.active=false;
  }
  async start(rideId) {
    this.stop();if(!this.geolocation)throw new Error('Localização indisponível neste navegador.');
    if(!rideId)throw new Error('Nenhuma corrida ativa.');
    const authToken=this.generation;await this.transport.authorizeDriver(rideId);if(authToken!==this.generation)return;
    const token=++this.generation;this.active=true;this.lastSent=0;this.onStatus('Aguardando sua localização…');
    this.watch=this.geolocation.watchPosition(async pos=>{
      if(!this.active||token!==this.generation)return;
      const {latitude:lat,longitude:lng,accuracy}=pos.coords;
      if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return;
      if(!Number.isFinite(accuracy)||accuracy>150){this.onStatus('Sinal de localização impreciso. Aguardando melhora.');return;}
      if(this.sending||this.lastSent&&this.now()-this.lastSent<this.intervalMs)return;
      this.sending=true;
      try{await this.transport.writePosition(rideId,{lat,lng,accuracy,measuredAt:pos.timestamp});if(token===this.generation){this.lastSent=this.now();this.onStatus('Localização compartilhada com o passageiro.');}}
      catch{if(token===this.generation)this.onStatus('Sem conexão. Tentando novamente na próxima atualização.');}
      finally{this.sending=false;}
    },err=>{if(token!==this.generation)return;this.onStatus(err.code===1?'Permissão negada. A localização não está sendo compartilhada.':'Localização indisponível. Verifique o GPS.');if(err.code===1)this.stop();},{enableHighAccuracy:true,maximumAge:3000,timeout:15000});
  }
  async observe(rideId) {
    this.stop();const authToken=this.generation;await this.transport.authorizePassenger(rideId);if(authToken!==this.generation)return;const token=++this.generation;this.active=true;
    this.unsubscribe=this.transport.subscribePosition(rideId,p=>{
      if(!this.active||token!==this.generation)return;
      if(!p||!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||!Number.isFinite(p.receivedAt))return;
      if(this.now()-p.receivedAt>30000){this.onStatus('Última posição recebida há mais de 30 segundos.');return;}
      this.onPosition(p);this.onStatus('Posição atualizada do motorista.');
    },()=>this.onStatus('Conexão interrompida. A posição pode estar desatualizada.'));
  }
  stop(){this.active=false;this.generation++;if(this.watch!==null){this.geolocation.clearWatch(this.watch);this.watch=null;}if(this.unsubscribe){this.unsubscribe();this.unsubscribe=null;}}
}
if(typeof module!=='undefined')module.exports=PartiuTracker;
else globalThis.PartiuTracker=PartiuTracker;
