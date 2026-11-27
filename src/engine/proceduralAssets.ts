import * as THREE from 'three';

export type PrimitiveType =
  | 'cube'
  | 'sphere'
  | 'icosphere'
  | 'cylinder'
  | 'cone'
  | 'torus'
  | 'torusknot'
  | 'prism'
  | 'plane';

export type CompositeAssetType =
  | 'optical_prism_rig'
  | 'studio_bust'
  | 'gear_assembly'
  | 'crystal_cluster'
  | 'pavilion'
  | 'minecraft_rig';

function createCalibrationDialTexture(maxAnisotropy = 4): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1d2026';
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;

  // Subtle concentric lathe rings
  for (let r = 80; r < 490; r += 28) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Outer degree ticks
  for (let deg = 0; deg < 360; deg += 5) {
    const rad = (deg * Math.PI) / 180;
    const isMajor = deg % 30 === 0;
    const isMid = deg % 15 === 0;
    const rOuter = 472;
    const rInner = isMajor ? 434 : isMid ? 448 : 458;

    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(rad) * rInner, cy + Math.sin(rad) * rInner);
    ctx.lineTo(cx + Math.cos(rad) * rOuter, cy + Math.sin(rad) * rOuter);
    ctx.strokeStyle = isMajor ? 'rgba(232, 125, 47, 0.85)' : 'rgba(220, 226, 235, 0.35)';
    ctx.lineWidth = isMajor ? 3 : 1.5;
    ctx.stroke();
  }

  // Center crosshair
  ctx.strokeStyle = 'rgba(232, 125, 47, 0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 120, cy);
  ctx.lineTo(cx + 120, cy);
  ctx.moveTo(cx, cy - 120);
  ctx.lineTo(cx, cy + 120);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createPrimitiveMesh(type: PrimitiveType): THREE.Mesh {
  let geometry: THREE.BufferGeometry;
  let name = 'Mesh';

  switch (type) {
    case 'cube':
      geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2, 1, 1, 1);
      name = 'Cube';
      break;
    case 'sphere':
      geometry = new THREE.SphereGeometry(0.7, 48, 32);
      name = 'UV Sphere';
      break;
    case 'icosphere':
      geometry = new THREE.IcosahedronGeometry(0.7, 2);
      name = 'Icosphere';
      break;
    case 'cylinder':
      geometry = new THREE.CylinderGeometry(0.55, 0.55, 1.4, 48);
      name = 'Cylinder';
      break;
    case 'cone':
      geometry = new THREE.ConeGeometry(0.65, 1.4, 48);
      name = 'Cone';
      break;
    case 'torus':
      geometry = new THREE.TorusGeometry(0.6, 0.22, 28, 64);
      name = 'Torus';
      break;
    case 'torusknot':
      geometry = new THREE.TorusKnotGeometry(0.5, 0.16, 128, 24);
      name = 'Torus Knot';
      break;
    case 'prism':
      geometry = new THREE.CylinderGeometry(0.7, 0.7, 1.3, 3);
      name = 'Triangular Prism';
      break;
    case 'plane':
      geometry = new THREE.PlaneGeometry(2.4, 2.4, 8, 8);
      geometry.rotateX(-Math.PI / 2);
      name = 'Plane';
      break;
  }

  const material = new THREE.MeshStandardMaterial({
    color: 0xc2c7d0,
    roughness: 0.42,
    metalness: 0.08,
    side: type === 'plane' ? THREE.DoubleSide : THREE.FrontSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  geometry.computeBoundingBox();
  if (geometry.boundingBox) {
    mesh.position.y = -geometry.boundingBox.min.y;
  }

  return mesh;
}

export function createCompositeAsset(
  type: CompositeAssetType,
  isSoftwareGl = false,
  maxAnisotropy = 4
): THREE.Group {
  const group = new THREE.Group();

  switch (type) {
    case 'optical_prism_rig': {
      group.name = 'Optical Prism Rig';

      // 1. Machined dark anodized base plinth
      const baseGeo = new THREE.CylinderGeometry(1.38, 1.48, 0.18, 64);
      const dialTex = createCalibrationDialTexture(maxAnisotropy);
      const baseSideMat = new THREE.MeshStandardMaterial({
        color: 0x20232a,
        roughness: 0.35,
        metalness: 0.85,
      });
      const baseTopMat = new THREE.MeshStandardMaterial({
        map: dialTex,
        roughness: 0.38,
        metalness: 0.6,
      });
      const baseMesh = new THREE.Mesh(baseGeo, [baseSideMat, baseTopMat, baseSideMat]);
      baseMesh.position.y = 0.09;
      baseMesh.name = 'Anodized Plinth';
      baseMesh.castShadow = true;
      baseMesh.receiveShadow = true;
      group.add(baseMesh);

      // 2. Knurled brass calibration ring
      const ringGeo = new THREE.TorusGeometry(1.12, 0.045, 20, 72);
      ringGeo.rotateX(Math.PI / 2);
      const brassMat = new THREE.MeshPhysicalMaterial({
        color: 0xd9a441,
        roughness: 0.22,
        metalness: 0.94,
        clearcoat: 0.35,
      });
      const ringMesh = new THREE.Mesh(ringGeo, brassMat);
      ringMesh.position.y = 0.19;
      ringMesh.name = 'Brass Calibration Ring';
      ringMesh.castShadow = true;
      group.add(ringMesh);

      // 3. Beveled triangular optical prism (ExtrudeGeometry)
      const triShape = new THREE.Shape();
      const r = 0.78;
      for (let i = 0; i < 3; i++) {
        const angle = (i * 2 * Math.PI) / 3 - Math.PI / 2;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) triShape.moveTo(x, y);
        else triShape.lineTo(x, y);
      }
      triShape.closePath();

      const prismGeo = new THREE.ExtrudeGeometry(triShape, {
        depth: 1.05,
        bevelEnabled: true,
        bevelThickness: 0.045,
        bevelSize: 0.035,
        bevelSegments: 4,
      });
      prismGeo.center();
      prismGeo.computeVertexNormals();

      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xe6f3ff,
        roughness: 0.06,
        metalness: 0.0,
        transmission: isSoftwareGl ? 0 : 0.92,
        transparent: true,
        opacity: isSoftwareGl ? 0.45 : 1.0,
        ior: 1.56,
        thickness: 1.3,
        attenuationColor: new THREE.Color(0x9bd3ff),
        attenuationDistance: 2.2,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
      });
      const prismMesh = new THREE.Mesh(prismGeo, glassMat);
      prismMesh.position.set(0, 0.92, 0);
      prismMesh.rotation.y = Math.PI / 6;
      prismMesh.name = 'Optical Glass Prism';
      prismMesh.castShadow = true;
      prismMesh.receiveShadow = true;
      group.add(prismMesh);

      // 4. Inner suspended amber core (visible through glass!)
      const coreGeo = new THREE.OctahedronGeometry(0.22, 0);
      const coreMat = new THREE.MeshStandardMaterial({
        color: 0xe87d2f,
        emissive: 0xe87d2f,
        emissiveIntensity: 0.55,
        roughness: 0.25,
        metalness: 0.7,
      });
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.position.set(0, 0.92, 0);
      coreMesh.name = 'Refraction Core';
      group.add(coreMesh);

      // 5. Three precision tripod stanchions supporting the prism cradle
      const postGeo = new THREE.CylinderGeometry(0.038, 0.048, 0.42, 20);
      const steelMat = new THREE.MeshStandardMaterial({
        color: 0x9aa3b2,
        roughness: 0.24,
        metalness: 0.9,
      });
      for (let i = 0; i < 3; i++) {
        const a = (i * 2 * Math.PI) / 3 + Math.PI / 6;
        const post = new THREE.Mesh(postGeo, steelMat);
        post.position.set(Math.cos(a) * 0.72, 0.36, Math.sin(a) * 0.72);
        post.name = `Support Stanchion ${i + 1}`;
        post.castShadow = true;
        group.add(post);
      }

      // 6. Calibration reference sphere (brushed titanium) & matte ceramic cube
      const refSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.24, 36, 24),
        new THREE.MeshStandardMaterial({ color: 0xd4dae4, roughness: 0.16, metalness: 0.95 })
      );
      refSphere.position.set(0.84, 0.42, 0.46);
      refSphere.name = 'Chrome Calibration Sphere';
      refSphere.castShadow = true;
      refSphere.receiveShadow = true;
      group.add(refSphere);

      const refCube = new THREE.Mesh(
        new THREE.BoxGeometry(0.36, 0.36, 0.36),
        new THREE.MeshStandardMaterial({ color: 0x8e95a3, roughness: 0.72, metalness: 0.05 })
      );
      refCube.position.set(-0.82, 0.36, 0.48);
      refCube.rotation.y = 0.45;
      refCube.name = 'Matte Clay Reference Block';
      refCube.castShadow = true;
      refCube.receiveShadow = true;
      group.add(refCube);

      break;
    }

    case 'studio_bust': {
      group.name = 'Studio Sculpt Bust';
      const clayMat = new THREE.MeshStandardMaterial({
        color: 0xb9bec8,
        roughness: 0.52,
        metalness: 0.05,
      });
      const darkMat = new THREE.MeshStandardMaterial({
        color: 0x22262e,
        roughness: 0.25,
        metalness: 0.85,
      });
      const accentMat = new THREE.MeshStandardMaterial({
        color: 0xe87d2f,
        roughness: 0.3,
        metalness: 0.65,
      });

      const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.68, 0.24, 32), darkMat);
      plinth.position.y = 0.12;
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      group.add(plinth);

      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.36, 24), clayMat);
      neck.position.y = 0.4;
      neck.castShadow = true;
      group.add(neck);

      const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.48, 32, 24), clayMat);
      cranium.scale.set(1.0, 1.08, 1.05);
      cranium.position.y = 0.92;
      cranium.castShadow = true;
      group.add(cranium);

      const snout = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 18), clayMat);
      snout.scale.set(1.1, 0.72, 0.9);
      snout.position.set(0, 0.76, 0.36);
      snout.castShadow = true;
      group.add(snout);

      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.14, 0.22), clayMat);
      brow.position.set(0, 1.04, 0.36);
      brow.castShadow = true;
      group.add(brow);

      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 16, 28), clayMat);
        ear.position.set(side * 0.56, 0.95, -0.02);
        ear.rotation.y = side * 0.25;
        ear.castShadow = true;
        group.add(ear);

        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.085, 20, 16), accentMat);
        eye.position.set(side * 0.18, 0.94, 0.44);
        group.add(eye);
      }
      break;
    }

    case 'gear_assembly': {
      group.name = 'Mechanical Gear Assembly';
      const steelMat = new THREE.MeshStandardMaterial({ color: 0x9aa4b4, roughness: 0.28, metalness: 0.88 });
      const brassMat = new THREE.MeshStandardMaterial({ color: 0xd49a3a, roughness: 0.24, metalness: 0.92 });
      const housingMat = new THREE.MeshStandardMaterial({ color: 0x262a32, roughness: 0.55, metalness: 0.4 });

      const makeGearGeo = (teeth: number, outerR: number, innerR: number, thickness: number) => {
        const shape = new THREE.Shape();
        const step = (Math.PI * 2) / teeth;
        for (let i = 0; i < teeth; i++) {
          const a0 = i * step;
          const a1 = a0 + step * 0.22;
          const a2 = a0 + step * 0.32;
          const a3 = a0 + step * 0.62;
          const a4 = a0 + step * 0.72;
          const rRoot = outerR * 0.82;
          if (i === 0) shape.moveTo(Math.cos(a0) * rRoot, Math.sin(a0) * rRoot);
          else shape.lineTo(Math.cos(a0) * rRoot, Math.sin(a0) * rRoot);
          shape.lineTo(Math.cos(a1) * rRoot, Math.sin(a1) * rRoot);
          shape.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
          shape.lineTo(Math.cos(a3) * outerR, Math.sin(a3) * outerR);
          shape.lineTo(Math.cos(a4) * rRoot, Math.sin(a4) * rRoot);
        }
        shape.closePath();

        const hole = new THREE.Path();
        hole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
        shape.holes.push(hole);

        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: thickness,
          bevelEnabled: true,
          bevelThickness: 0.02,
          bevelSize: 0.015,
          bevelSegments: 2,
        });
        geo.center();
        return geo;
      };

      const basePlate = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 1.2), housingMat);
      basePlate.position.y = 0.08;
      basePlate.castShadow = true;
      basePlate.receiveShadow = true;
      group.add(basePlate);

      const gear1 = new THREE.Mesh(makeGearGeo(16, 0.65, 0.18, 0.18), steelMat);
      gear1.position.set(-0.42, 0.85, 0);
      gear1.castShadow = true;
      gear1.name = 'Primary Spur Gear';
      group.add(gear1);

      const gear2 = new THREE.Mesh(makeGearGeo(10, 0.42, 0.14, 0.18), brassMat);
      gear2.position.set(0.56, 0.85, 0);
      gear2.rotation.z = Math.PI / 10;
      gear2.castShadow = true;
      gear2.name = 'Pinion Brass Gear';
      group.add(gear2);

      const shaft1 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 24), brassMat);
      shaft1.rotation.x = Math.PI / 2;
      shaft1.position.set(-0.42, 0.85, 0);
      group.add(shaft1);

      const shaft2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.44, 24), steelMat);
      shaft2.rotation.x = Math.PI / 2;
      shaft2.position.set(0.56, 0.85, 0);
      group.add(shaft2);

      const stanchion1 = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.24), housingMat);
      stanchion1.position.set(-0.42, 0.5, -0.2);
      stanchion1.castShadow = true;
      group.add(stanchion1);

      const stanchion2 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.24), housingMat);
      stanchion2.position.set(0.56, 0.5, -0.2);
      stanchion2.castShadow = true;
      group.add(stanchion2);
      break;
    }

    case 'crystal_cluster': {
      group.name = 'Quartz Crystal Cluster';
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.88, metalness: 0.08 });
      const crystalMat = new THREE.MeshPhysicalMaterial({
        color: 0x7dd3fc,
        roughness: 0.08,
        metalness: 0.05,
        transmission: isSoftwareGl ? 0 : 0.85,
        transparent: true,
        opacity: isSoftwareGl ? 0.55 : 1.0,
        ior: 1.54,
        thickness: 0.9,
        clearcoat: 1.0,
      });

      const baseRock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.85, 1), rockMat);
      baseRock.scale.set(1.2, 0.45, 1.1);
      baseRock.position.y = 0.28;
      baseRock.castShadow = true;
      baseRock.receiveShadow = true;
      group.add(baseRock);

      const specs = [
        { pos: [0, 0.9, 0], rot: [0.05, 0.2, -0.06], r: 0.24, h: 1.45 },
        { pos: [0.32, 0.72, 0.18], rot: [0.28, 0.4, -0.34], r: 0.17, h: 1.05 },
        { pos: [-0.34, 0.68, 0.14], rot: [0.18, -0.3, 0.36], r: 0.18, h: 1.0 },
        { pos: [0.14, 0.62, -0.3], rot: [-0.35, 0.1, -0.15], r: 0.15, h: 0.9 },
        { pos: [-0.2, 0.55, -0.26], rot: [-0.28, 0.5, 0.25], r: 0.14, h: 0.78 },
      ];
      specs.forEach((s, idx) => {
        const spire = new THREE.Mesh(new THREE.ConeGeometry(s.r, s.h, 6), crystalMat);
        spire.position.set(s.pos[0], s.pos[1], s.pos[2]);
        spire.rotation.set(s.rot[0], s.rot[1], s.rot[2]);
        spire.castShadow = true;
        spire.name = `Crystal Spire ${idx + 1}`;
        group.add(spire);
      });
      break;
    }

    case 'pavilion': {
      group.name = 'Architectural Pavilion';
      const stoneMat = new THREE.MeshStandardMaterial({ color: 0xd9d4ca, roughness: 0.78, metalness: 0.02 });
      const bronzeMat = new THREE.MeshStandardMaterial({ color: 0x3b3530, roughness: 0.38, metalness: 0.78 });
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xdbeafe,
        roughness: 0.06,
        transmission: isSoftwareGl ? 0 : 0.88,
        transparent: true,
        opacity: isSoftwareGl ? 0.4 : 1.0,
        ior: 1.5,
      });

      const step1 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 2.2), stoneMat);
      step1.position.y = 0.07;
      step1.castShadow = true;
      step1.receiveShadow = true;
      group.add(step1);

      const step2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.14, 1.8), stoneMat);
      step2.position.y = 0.21;
      step2.castShadow = true;
      step2.receiveShadow = true;
      group.add(step2);

      const colGeo = new THREE.CylinderGeometry(0.07, 0.08, 1.2, 20);
      for (const x of [-0.88, 0.88]) {
        for (const z of [-0.68, 0.68]) {
          const col = new THREE.Mesh(colGeo, bronzeMat);
          col.position.set(x, 0.88, z);
          col.castShadow = true;
          group.add(col);
        }
      }

      const roof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.14, 2.1), stoneMat);
      roof.position.y = 1.55;
      roof.castShadow = true;
      roof.receiveShadow = true;
      group.add(roof);

      const glassWall = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.15, 1.1), glassMat);
      glassWall.position.y = 0.86;
      group.add(glassWall);
      break;
    }

    case 'minecraft_rig': {
      const rig = createMinecraftRigAsset();
      return rig.group;
    }
  }

  return group;
}

function makePixelTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

function createMinecraftFaceMaterials(): THREE.Material[] {
  // 8x8 pixel textures per face: [+x, -x, +y, -y, +z(front), -z(back)]
  const skinBase = '#eab68d';
  const skinShade = '#d99e73';
  const hairDark = '#3a2518';
  const hairMid = '#4c3221';

  const makeHairMat = () =>
    new THREE.MeshStandardMaterial({
      map: makePixelTexture(8, 8, (ctx) => {
        ctx.fillStyle = hairDark;
        ctx.fillRect(0, 0, 8, 8);
        ctx.fillStyle = hairMid;
        ctx.fillRect(1, 1, 2, 2);
        ctx.fillRect(5, 2, 2, 1);
        ctx.fillRect(2, 5, 3, 2);
      }),
      roughness: 0.82,
      metalness: 0.02,
    });

  const makeSideHeadMat = (mirror = false) =>
    new THREE.MeshStandardMaterial({
      map: makePixelTexture(8, 8, (ctx) => {
        ctx.fillStyle = skinBase;
        ctx.fillRect(0, 0, 8, 8);
        ctx.fillStyle = hairDark;
        ctx.fillRect(0, 0, 8, 2);
        if (mirror) {
          ctx.fillRect(0, 2, 4, 3);
          ctx.fillRect(0, 5, 2, 3);
        } else {
          ctx.fillRect(4, 2, 4, 3);
          ctx.fillRect(6, 5, 2, 3);
        }
      }),
      roughness: 0.78,
      metalness: 0.02,
    });

  const frontMat = new THREE.MeshStandardMaterial({
    map: makePixelTexture(8, 8, (ctx) => {
      ctx.fillStyle = skinBase;
      ctx.fillRect(0, 0, 8, 8);
      // Hair fringe
      ctx.fillStyle = hairDark;
      ctx.fillRect(0, 0, 8, 2);
      ctx.fillRect(0, 2, 1, 1);
      ctx.fillRect(7, 2, 1, 1);
      // Eyes
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(1, 4, 1, 1);
      ctx.fillRect(6, 4, 1, 1);
      ctx.fillStyle = '#2b59c3';
      ctx.fillRect(2, 4, 1, 1);
      ctx.fillRect(5, 4, 1, 1);
      // Nose
      ctx.fillStyle = skinShade;
      ctx.fillRect(3, 5, 2, 1);
      // Smile / beard trim
      ctx.fillStyle = '#7c4d34';
      ctx.fillRect(2, 6, 4, 1);
      ctx.fillRect(2, 7, 1, 1);
      ctx.fillRect(5, 7, 1, 1);
      ctx.fillStyle = '#c48462';
      ctx.fillRect(3, 7, 2, 1);
    }),
    roughness: 0.76,
    metalness: 0.02,
  });

  const skinBottomMat = new THREE.MeshStandardMaterial({ color: skinShade, roughness: 0.8 });

  return [
    makeSideHeadMat(true),
    makeSideHeadMat(false),
    makeHairMat(),
    skinBottomMat,
    frontMat,
    makeHairMat(),
  ];
}

function createMinecraftTorsoMaterials(): THREE.Material[] {
  const shirtFront = new THREE.MeshStandardMaterial({
    map: makePixelTexture(8, 12, (ctx) => {
      ctx.fillStyle = '#1f9cb0';
      ctx.fillRect(0, 0, 8, 12);
      ctx.fillStyle = '#25b4ca';
      ctx.fillRect(1, 2, 6, 6);
      // V-neck collar
      ctx.fillStyle = '#eab68d';
      ctx.fillRect(2, 0, 4, 1);
      ctx.fillRect(3, 1, 2, 1);
      // Belt
      ctx.fillStyle = '#3f2e22';
      ctx.fillRect(0, 10, 8, 2);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(3, 10, 2, 1);
    }),
    roughness: 0.78,
    metalness: 0.04,
  });
  const shirtPlain = new THREE.MeshStandardMaterial({ color: '#1f9cb0', roughness: 0.8 });
  return [shirtPlain, shirtPlain, shirtPlain, shirtPlain, shirtFront, shirtPlain];
}

function createMinecraftArmMaterials(): THREE.Material[] {
  const armTex = new THREE.MeshStandardMaterial({
    map: makePixelTexture(4, 12, (ctx) => {
      ctx.fillStyle = '#eab68d';
      ctx.fillRect(0, 0, 4, 12);
      ctx.fillStyle = '#1f9cb0';
      ctx.fillRect(0, 0, 4, 4);
      ctx.fillStyle = '#178394';
      ctx.fillRect(0, 3, 4, 1);
    }),
    roughness: 0.78,
    metalness: 0.02,
  });
  const skinMat = new THREE.MeshStandardMaterial({ color: '#eab68d', roughness: 0.8 });
  const sleeveMat = new THREE.MeshStandardMaterial({ color: '#1f9cb0', roughness: 0.8 });
  return [armTex, armTex, sleeveMat, skinMat, armTex, armTex];
}

function createMinecraftLegMaterials(): THREE.Material[] {
  const legTex = new THREE.MeshStandardMaterial({
    map: makePixelTexture(4, 12, (ctx) => {
      ctx.fillStyle = '#314478';
      ctx.fillRect(0, 0, 4, 12);
      ctx.fillStyle = '#3b528f';
      ctx.fillRect(1, 1, 2, 7);
      // Boots
      ctx.fillStyle = '#2d2930';
      ctx.fillRect(0, 9, 4, 3);
      ctx.fillStyle = '#47424c';
      ctx.fillRect(0, 9, 4, 1);
    }),
    roughness: 0.82,
    metalness: 0.05,
  });
  const pantMat = new THREE.MeshStandardMaterial({ color: '#314478', roughness: 0.85 });
  const bootMat = new THREE.MeshStandardMaterial({ color: '#242027', roughness: 0.85 });
  return [legTex, legTex, pantMat, bootMat, legTex, legTex];
}

export function createMinecraftRigAsset(): {
  group: THREE.Group;
  animations: THREE.AnimationClip[];
} {
  const group = new THREE.Group();
  group.name = 'Minecraft Character Rig';

  // Torso (center at y = 1.125)
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.25), createMinecraftTorsoMaterials());
  torso.position.set(0, 1.125, 0);
  torso.name = 'Torso';
  torso.castShadow = true;
  torso.receiveShadow = true;
  group.add(torso);

  // Head Joint (pivot at neck y = 1.50)
  const headPivot = new THREE.Group();
  headPivot.name = 'Head_Pivot';
  headPivot.position.set(0, 1.5, 0);
  const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), createMinecraftFaceMaterials());
  headMesh.position.set(0, 0.25, 0);
  headMesh.name = 'Head';
  headMesh.castShadow = true;
  headMesh.receiveShadow = true;
  headPivot.add(headMesh);
  group.add(headPivot);

  // Arm Joints (pivot at shoulder y = 1.50, x = ±0.375)
  const armMats = createMinecraftArmMaterials();

  const rightArmPivot = new THREE.Group();
  rightArmPivot.name = 'RightArm_Pivot';
  rightArmPivot.position.set(-0.375, 1.5, 0);
  const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.75, 0.25), armMats);
  rightArmMesh.position.set(0, -0.375, 0);
  rightArmMesh.name = 'Right_Arm';
  rightArmMesh.castShadow = true;
  rightArmMesh.receiveShadow = true;
  rightArmPivot.add(rightArmMesh);

  // Voxel Diamond Pickaxe held in Right Hand
  const pickaxe = new THREE.Group();
  pickaxe.name = 'Diamond_Pickaxe';
  const woodMat = new THREE.MeshStandardMaterial({ color: '#6b4423', roughness: 0.85 });
  const diamondMat = new THREE.MeshPhysicalMaterial({
    color: '#38bdf8',
    roughness: 0.16,
    metalness: 0.25,
    clearcoat: 0.85,
  });
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.58, 0.06), woodMat);
  handle.position.set(0, 0.18, 0);
  handle.castShadow = true;
  pickaxe.add(handle);

  const headCenter = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.42), diamondMat);
  headCenter.position.set(0, 0.44, 0.04);
  headCenter.castShadow = true;
  pickaxe.add(headCenter);

  const tipFront = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.1), diamondMat);
  tipFront.position.set(0, 0.37, 0.24);
  tipFront.castShadow = true;
  pickaxe.add(tipFront);

  const tipBack = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.1), diamondMat);
  tipBack.position.set(0, 0.37, -0.16);
  tipBack.castShadow = true;
  pickaxe.add(tipBack);

  pickaxe.position.set(0, -0.68, 0.18);
  pickaxe.rotation.x = Math.PI / 2.3;
  rightArmPivot.add(pickaxe);
  group.add(rightArmPivot);

  const leftArmPivot = new THREE.Group();
  leftArmPivot.name = 'LeftArm_Pivot';
  leftArmPivot.position.set(0.375, 1.5, 0);
  const leftArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.75, 0.25), armMats);
  leftArmMesh.position.set(0, -0.375, 0);
  leftArmMesh.name = 'Left_Arm';
  leftArmMesh.castShadow = true;
  leftArmMesh.receiveShadow = true;
  leftArmPivot.add(leftArmMesh);
  group.add(leftArmPivot);

  // Leg Joints (pivot at hip y = 0.75, x = ±0.125)
  const legMats = createMinecraftLegMaterials();

  const rightLegPivot = new THREE.Group();
  rightLegPivot.name = 'RightLeg_Pivot';
  rightLegPivot.position.set(-0.125, 0.75, 0);
  const rightLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.75, 0.25), legMats);
  rightLegMesh.position.set(0, -0.375, 0);
  rightLegMesh.name = 'Right_Leg';
  rightLegMesh.castShadow = true;
  rightLegMesh.receiveShadow = true;
  rightLegPivot.add(rightLegMesh);
  group.add(rightLegPivot);

  const leftLegPivot = new THREE.Group();
  leftLegPivot.name = 'LeftLeg_Pivot';
  leftLegPivot.position.set(0.125, 0.75, 0);
  const leftLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.75, 0.25), legMats);
  leftLegMesh.position.set(0, -0.375, 0);
  leftLegMesh.name = 'Left_Leg';
  leftLegMesh.castShadow = true;
  leftLegMesh.receiveShadow = true;
  leftLegPivot.add(leftLegMesh);
  group.add(leftLegPivot);

  // Built-in Walk & Idle Look AnimationClip (2.0s seamless loop)
  const times = [0, 0.5, 1.0, 1.5, 2.0];
  const makeSwingTrack = (nodeName: string, angles: number[]) => {
    const qValues: number[] = [];
    const q = new THREE.Quaternion();
    const xAxis = new THREE.Vector3(1, 0, 0);
    for (const a of angles) {
      q.setFromAxisAngle(xAxis, a);
      qValues.push(q.x, q.y, q.z, q.w);
    }
    return new THREE.QuaternionKeyframeTrack(`${nodeName}.quaternion`, times, qValues);
  };

  const makeHeadTrack = () => {
    const qValues: number[] = [];
    const q = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const yaws = [0, 0.14, 0, -0.14, 0];
    const pitches = [0, -0.05, 0.03, -0.04, 0];
    for (let i = 0; i < times.length; i++) {
      euler.set(pitches[i], yaws[i], 0);
      q.setFromEuler(euler);
      qValues.push(q.x, q.y, q.z, q.w);
    }
    return new THREE.QuaternionKeyframeTrack('Head_Pivot.quaternion', times, qValues);
  };

  const walkClip = new THREE.AnimationClip('Minecraft_Walk_Cycle', 2.0, [
    makeSwingTrack('RightArm_Pivot', [0, -0.55, 0, 0.45, 0]),
    makeSwingTrack('LeftArm_Pivot', [0, 0.55, 0, -0.55, 0]),
    makeSwingTrack('RightLeg_Pivot', [0, 0.6, 0, -0.6, 0]),
    makeSwingTrack('LeftLeg_Pivot', [0, -0.6, 0, 0.6, 0]),
    makeHeadTrack(),
  ]);

  return { group, animations: [walkClip] };
}

export function createSceneCameraAsset(cameraNumber = 1, fov = 45): THREE.Group {
  const group = new THREE.Group();
  group.name = cameraNumber <= 1 ? 'Camera' : `Camera ${cameraNumber}`;
  group.userData.isSceneCamera = true;
  group.userData.cameraFov = fov;

  // All visible camera parts live inside visualRoot so looking *through* this camera hides only its body
  const visualRoot = new THREE.Group();
  visualRoot.name = '__CameraBodyVisual';
  group.userData.visualRoot = visualRoot;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x20242c,
    roughness: 0.46,
    metalness: 0.55,
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x9aa4b4,
    roughness: 0.25,
    metalness: 0.88,
  });
  const lensGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x67b8ff,
    roughness: 0.08,
    metalness: 0.1,
    clearcoat: 1.0,
    ior: 1.52,
  });
  const tallyMat = new THREE.MeshStandardMaterial({
    color: 0xe87d2f,
    emissive: 0xe87d2f,
    emissiveIntensity: 0.9,
    roughness: 0.3,
  });

  // Main cinema body (oriented facing -Z to match Three.js camera forward axis)
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.52), bodyMat);
  body.castShadow = true;
  visualRoot.add(body);

  // Top carry handle & hotshoe
  const handleBar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.34), metalMat);
  handleBar.position.set(0, 0.2, 0.02);
  handleBar.castShadow = true;
  visualRoot.add(handleBar);

  // Lens barrel facing -Z
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.26, 24), metalMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0, -0.35);
  barrel.castShadow = true;
  visualRoot.add(barrel);

  // Matte lens hood
  const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.145, 0.1, 24), bodyMat);
  hood.rotation.x = Math.PI / 2;
  hood.position.set(0, 0, -0.49);
  visualRoot.add(hood);

  // Optical glass front element
  const optic = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 24), lensGlassMat);
  optic.rotation.x = Math.PI / 2;
  optic.position.set(0, 0, -0.46);
  visualRoot.add(optic);

  // Tally light dot on top-front
  const tally = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), tallyMat);
  tally.position.set(0, 0.17, -0.2);
  visualRoot.add(tally);

  // Subtle frustum pyramid lines extending forward along -Z
  const d = 1.35;
  const halfH = Math.tan(THREE.MathUtils.degToRad(fov * 0.5)) * d;
  const halfW = halfH * 1.5;
  const frustumPositions = new Float32Array([
    0, 0, -0.45, -halfW, halfH, -d,
    0, 0, -0.45, halfW, halfH, -d,
    0, 0, -0.45, halfW, -halfH, -d,
    0, 0, -0.45, -halfW, -halfH, -d,
    -halfW, halfH, -d, halfW, halfH, -d,
    halfW, halfH, -d, halfW, -halfH, -d,
    halfW, -halfH, -d, -halfW, -halfH, -d,
    -halfW, -halfH, -d, -halfW, halfH, -d,
  ]);
  const frustumGeo = new THREE.BufferGeometry();
  frustumGeo.setAttribute('position', new THREE.BufferAttribute(frustumPositions, 3));
  const frustumLines = new THREE.LineSegments(
    frustumGeo,
    new THREE.LineBasicMaterial({ color: 0xe87d2f, transparent: true, opacity: 0.65 })
  );
  visualRoot.add(frustumLines);

  group.add(visualRoot);

  // Default studio position overlooking the center stage
  group.position.set(2.8, 1.55, 3.2);
  group.lookAt(0, 0.75, 0);

  return group;
}


