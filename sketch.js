function setup() {
    createCanvas(300, 300, WEBGL);
  }
  
let theta, phi;
  
function draw() {
    background("pink");
    orbitControl();
    
    let hr = hour() + minute() / 60;
    let mn = minute();
    let r = 100;
    
    theta = map(hr, 0, 24, 0, PI);
    phi = map(mn, 0, 60, 0, TWO_PI);
    
    let x = r * sin(theta) * cos(phi);
    let y = r * sin(theta) * sin(phi);
    let z = r * cos(theta);
    stroke("black");
    line(0, 0, 0, x, y, z);
    
    beginShape();
    stroke("yellow");
    for (let a = 0; a <= TWO_PI; a += 0.10) {
      x = cos(a) * r;
      y = r * sin(a);
      z = 0;
      vertex(x,y,z);
    }
    endShape(CLOSE);
    
    beginShape();
    stroke("blue");
    for (let a = 0; a <= TWO_PI; a += 0.10) {
      x = cos(a) * r;
      y = 0;
      z = r * sin(a);
      vertex(x,y,z);
    }
    endShape(CLOSE);
    
    beginShape(); //hour
    stroke("red");
    for (let a = 0; a <= TWO_PI; a += 0.10) {
      x = 0;
      y = r * cos(a);
      z = r * sin(a);
      vertex(x,y,z);
    }
    endShape(CLOSE);
    
    stroke("black");
    point(0,0,0);
    stroke("purple");
    point(0,0,100); //(midnight)
    stroke("green");
    point(0, 0, -100);
    
    noFill();
    stroke(0, 10);
    sphere(r);
    
    diracpart();
  }

function diracpart() {
  let alpha_yeah = cos(theta / 2);
  let beta_real = cos(phi) * sin(theta/2);
  let beta_im = sin(phi) * sin(theta/2);
  
  let diracStr = `It is |ψ⟩ = ${alpha_yeah.toFixed(2)}|0⟩ + (${beta_real.toFixed(2)} + ${beta_im.toFixed(2)}i)|1⟩ 'o clock`;

  let diracText = document.getElementById("dirac-part");
  if (diracText) {
    diracText.innerText = diracStr;
  }
}

  
