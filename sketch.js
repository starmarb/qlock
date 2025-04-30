function setup() {
    createCanvas(400, 400, WEBGL);
  }
  
  let theta, phi;
  
  function draw() {
    background(220);
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
  }
  