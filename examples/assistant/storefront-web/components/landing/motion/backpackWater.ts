/** Local shallow-water feedback texture; no global cursor or animation loop. */
export class BackpackWater {
  private gl: WebGLRenderingContext;
  private programs: WebGLProgram[] = [];
  private textures: WebGLTexture[] = [];
  private targets: WebGLFramebuffer[] = [];
  private buffer: WebGLBuffer;
  private index = 0;
  private readonly resolution = 192;
  readonly canvas = document.createElement("canvas");

  constructor(outside: HTMLCanvasElement, inside: HTMLImageElement, mask: HTMLCanvasElement) {
    this.canvas.width = this.canvas.height = outside.width;
    const gl = this.canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL unavailable");
    this.gl = gl;
    this.buffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
    const vertex = `attribute vec2 p; varying vec2 uv; void main(){uv=p*.5+.5;gl_Position=vec4(p,0.,1.);}`;
    const program = (fragment: string) => {
      const shaders = [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].map((type, i) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, i ? `precision highp float; varying vec2 uv; ${fragment}` : vertex);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "Shader failed");
        return s;
      });
      const p = gl.createProgram()!;
      shaders.forEach(s => gl.attachShader(p, s)); gl.linkProgram(p);
      shaders.forEach(s => gl.deleteShader(s));
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error("Program failed");
      this.programs.push(p); return p;
    };
    // R = height, G = previous height, B = reveal dye. Height propagates as a
    // damped wave, while its gradient advects dye into a moving, organic edge.
    program(`uniform sampler2D state; uniform vec2 point, previous; uniform float impulse;
      float h(vec2 q){return texture2D(state,q).r*2.-1.;}
      void main(){
        vec2 e=vec2(1./192.,0.); vec4 s=texture2D(state,uv);
        float l=h(uv-e),r=h(uv+e),b=h(uv-e.yx),t=h(uv+e.yx);
        float height=((l+r+b+t)*.5-(s.g*2.-1.))*.975;
        vec2 segment=point-previous; float along=clamp(dot(uv-previous,segment)/max(dot(segment,segment),.00001),0.,1.);
        float d=length(uv-previous-segment*along);
        float force=exp(-d*d/0.00065)*impulse;
        height=clamp(height+force*.16,-.8,.8);
        vec2 flow=vec2(r-l,t-b)*.018;
        float dye=texture2D(state,clamp(uv-flow,0.,1.)).b;
        dye=max(dye-.009, (1.-smoothstep(.065,.145,d))*impulse);
        gl_FragColor=vec4(height*.5+.5,s.r,dye,1.);
      }`);
    program(`uniform sampler2D state, outside, inside, mask; uniform float full;
      void main(){
        vec2 e=vec2(1./192.,0.); vec4 s=texture2D(state,uv);
        vec2 gradient=vec2(texture2D(state,uv+e).r-texture2D(state,uv-e).r,
          texture2D(state,uv+e.yx).r-texture2D(state,uv-e.yx).r);
        float allowed=texture2D(mask,uv).a;
        float reveal=max(full,smoothstep(.08,.55,s.b))*allowed;
        vec2 offset=gradient*.13*(1.-full)*allowed;
        vec4 original=texture2D(outside,uv);
        vec4 shell=texture2D(outside,clamp(uv+offset,0.,1.));
        vec4 contents=texture2D(inside,clamp(uv+offset*.65,0.,1.));
        vec3 color=mix(mix(original.rgb,shell.rgb,allowed),contents.rgb,reveal);
        color+=clamp((gradient.x-gradient.y)*.35,-.045,.045)*allowed*(1.-full);
        gl_FragColor=vec4(color,original.a);
      }`);
    const texture = (source?: TexImageSource) => {
      const t=gl.createTexture()!; this.textures.push(t); gl.bindTexture(gl.TEXTURE_2D,t);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      if(source){gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);}
      else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,this.resolution,this.resolution,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      return t;
    };
    for(let i=0;i<2;i++){
      const t=texture(); const f=gl.createFramebuffer()!;this.targets.push(f);
      gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);
    }
    texture(outside);texture(inside);texture(mask); this.clear();
  }
  private use(index:number){
    const gl=this.gl,p=this.programs[index];gl.useProgram(p);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);const a=gl.getAttribLocation(p,"p");
    gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);return p;
  }
  private bind(p:WebGLProgram,name:string,index:number,unit:number){
    const gl=this.gl;gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,this.textures[index]);
    gl.uniform1i(gl.getUniformLocation(p,name),unit);
  }
  clear(){
    const gl=this.gl;for(const f of this.targets){gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.clearColor(.5,.5,0,1);gl.clear(gl.COLOR_BUFFER_BIT);}
  }
  step(point:{x:number;y:number;px:number;py:number}|null){
    const gl=this.gl,p=this.use(0);gl.viewport(0,0,this.resolution,this.resolution);
    gl.bindFramebuffer(gl.FRAMEBUFFER,this.targets[1-this.index]);this.bind(p,"state",this.index,0);
    gl.uniform2f(gl.getUniformLocation(p,"point"),point?point.x/1000:-2,point?1-point.y/1000:-2);
    gl.uniform2f(gl.getUniformLocation(p,"previous"),point?point.px/1000:-2,point?1-point.py/1000:-2);
    gl.uniform1f(gl.getUniformLocation(p,"impulse"),point?1:0);gl.drawArrays(gl.TRIANGLES,0,6);this.index=1-this.index;
  }
  render(full=false){
    const gl=this.gl,p=this.use(1);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);
    this.bind(p,"state",this.index,0);this.bind(p,"outside",2,1);this.bind(p,"inside",3,2);this.bind(p,"mask",4,3);
    gl.uniform1f(gl.getUniformLocation(p,"full"),full?1:0);gl.drawArrays(gl.TRIANGLES,0,6);
    return this.canvas;
  }
  dispose(){const gl=this.gl;this.textures.forEach(t=>gl.deleteTexture(t));this.targets.forEach(f=>gl.deleteFramebuffer(f));this.programs.forEach(p=>gl.deleteProgram(p));gl.deleteBuffer(this.buffer);}
}
