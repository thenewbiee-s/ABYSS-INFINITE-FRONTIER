# ABYSS: INFINITE FRONTIER — Godot 4.3 Project

Open-universe procedural 3D space exploration, spherical planetary survival, alien biota, spacecraft flight, crafting, and base building built cleanly in **Godot 4.3 (GDScript 2.0)** for **Windows/Linux PC & Android Mobile (HP)**.

## Features
- **36 Planetary Archetypes** (`Paradise`, `Ocean`, `Deep Ocean`, `Bioluminescent`, `Volcanic`, `Lava`, `Ice Crystal`, `Machine World`, `Gas Giant`, and more) built as subdivided cube-spheres with exact `ConcavePolygonShape3D` trimesh colliders (zero terrain clipping).
- **47 Items & 20 Crafting Recipes** (`Ferrite Dust`, `Silicate Powder`, `Stellar Copper`, `Chromatic Metal`, `Abyssal Kelp Sac`, `Frost Crystal`, `Solanium Ember`, `Quantum Computer`, `Cryo-Thermal Stabilizer`, `Starship Hull Patch`, `Warp Hypercore`, etc.).
- **6 Alien Creature Morphologies**: procedural `Aquatic` swimmers (spawned underwater in real oceans), `Floater` bioluminescent medusae, 6-legged `Crawler`, horned `Quadruped`, crested `Biped`, and swept-wing `Flyer`.
- **Seamless Space-to-Planet Flight & 3-Point Ship Parking**: continuous atmospheric entry/exit without loading screens, plus 3-strut surface alignment so landing gear pads sit flush on terrain triangles.
- **Mouse POV & Mobile/HP Touch Support**: captured mouse camera look (`MOUSE_MODE_CAPTURED`) on PC and automatic responsive touch controls + right-screen look drag on mobile.
- **Persistent Multi-Slot Saves**: `user://saves/*.json` with SHA-256 verification and automatic `.bak.json` backup recovery.

## How to Open & Run in Godot 4.3+
1. Launch **Godot Engine 4.3+** (Standard / Forward+ or Mobile).
2. Click **Import** -> select `/godot_project/project.godot`.
3. Press **F5** (or Play) — main scene is `res://scenes/Main.tscn`.
4. To export for Android (HP): open **Project -> Export -> Android**, keep the preconfigured `Mobile` renderer & ETC2/ASTC VRAM compression.
