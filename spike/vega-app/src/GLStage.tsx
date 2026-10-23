import React, { useEffect, useRef } from 'react';
import { GLView } from '@amazon-devices/expo-gl';

// Native OpenGL ES: one background draw and one batched 300-point draw.
// The PNG sprites are the same native Image views as the SVG case.
export function GLStage({
  particles
}: {
  particles: number;
}) {
  const count = useRef(particles);
  count.current = particles;
  const stopped = useRef(false),
    frame = useRef(0);
  useEffect(() => () => {
    stopped.current = true;
    cancelAnimationFrame(frame.current);
  }, []);
  function onContextCreate(gl: any) {
    function compile(type: number, source: string) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    }
    function program(vertex: string, fragment: string) {
      const p = gl.createProgram();
      gl.attachShader(p, compile(gl.VERTEX_SHADER, vertex));
      gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragment));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      return p;
    }
    const background = program(`attribute vec2 xy;varying vec2 uv;void main(){uv=(xy+1.0)*.5;gl_Position=vec4(xy,0.,1.);}`, `
      precision mediump float;varying vec2 uv;uniform float time;
      void main(){
        vec2 p=vec2(uv.x,1.-uv.y);vec2 delta=(p-vec2(.5,.4167))*vec2(1.7778,1.);
        float ray=step(0.,sin((atan(delta.y,delta.x)+time*.035)*18.));
        vec3 color=mix(vec3(.1686,.2314,1.),vec3(.29,.39,1.),ray*.55);
        color+=vec3(.15,.24,.15)*exp(-dot(delta,delta)*5.);
        if(p.y>.6889){float depth=(p.y-.6889)/.3111;color=vec3(.10,.12,.53);
          float h=pow(depth,.5)*7.;float horizontal=1.-smoothstep(.0,.035,abs(fract(h)-.5));
          float gridX=(p.x-.5)/max(.025,depth)*8.;float vertical=1.-smoothstep(.0,.025,abs(fract(gridX)-.5));
          color+=vec3(.12,.16,.35)*max(horizontal,vertical);}
        float beam1=step(abs(p.x-.18),max(0.,p.y-.28)*.33),beam2=step(abs(p.x-.82),max(0.,p.y-.28)*.33);
        color+=vec3(.09,.08,.12)*(beam1+beam2);gl_FragColor=vec4(color,1.);
      }`);
    const points = program(`attribute vec2 xy;attribute vec3 color;varying vec3 c;uniform float size;void main(){c=color;gl_Position=vec4(xy,0.,1.);gl_PointSize=size;}`, `precision mediump float;varying vec3 c;void main(){gl_FragColor=vec4(c,1.);}`);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const buffer = gl.createBuffer(),
      data = new Float32Array(300 * 5),
      palette = [[1, .31, .63], [1, .83, .23], [.72, .95, .23], [.25, .88, .82]];
    const xy = gl.getAttribLocation(background, 'xy'),
      time = gl.getUniformLocation(background, 'time');
    const pxy = gl.getAttribLocation(points, 'xy'),
      color = gl.getAttribLocation(points, 'color'),
      size = gl.getUniformLocation(points, 'size');
    function draw() {
      if (stopped.current) return;
      const now = performance.now();
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.useProgram(background);
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(xy);
      gl.vertexAttribPointer(xy, 2, gl.FLOAT, false, 0, 0);
      gl.uniform1f(time, now / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disableVertexAttribArray(xy);
      const n = count.current;
      if (n) {
        for (let i = 0; i < n; i++) {
          const x = (i * 73.7 + now * (.012 + i % 7 * .003)) % 1280,
            y = 150 + (i * 37.3 + now * (.018 + i % 5 * .002)) % 560;
          data[i * 5] = x / 640 - 1;
          data[i * 5 + 1] = 1 - y / 360;
          data.set(palette[i % 4], i * 5 + 2);
        }
        gl.useProgram(points);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(pxy);
        gl.enableVertexAttribArray(color);
        gl.vertexAttribPointer(pxy, 2, gl.FLOAT, false, 20, 0);
        gl.vertexAttribPointer(color, 3, gl.FLOAT, false, 20, 8);
        gl.uniform1f(size, 6 * gl.drawingBufferWidth / 1280);
        gl.drawArrays(gl.POINTS, 0, n);
        gl.disableVertexAttribArray(pxy);
        gl.disableVertexAttribArray(color);
      }
      gl.endFrameEXP();
      frame.current = requestAnimationFrame(draw);
    }
    draw();
  }
  return <GLView style={{
    position: 'absolute',
    left: 0,
    top: 0,
    width: 1280,
    height: 720
  }} onContextCreate={onContextCreate} />;
}
