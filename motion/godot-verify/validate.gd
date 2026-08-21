extends SceneTree
func _initialize():
    var ok := true
    var sf = load("res://idle.tres")
    if sf == null or not (sf is SpriteFrames):
        print("FAIL: idle.tres did not load as SpriteFrames"); quit(1); return
    var names = sf.get_animation_names()
    var n = sf.get_frame_count("idle")
    print("animations=", names, " frame_count=", n, " speed=", sf.get_animation_speed("idle"), " loop=", sf.get_animation_loop("idle"))
    if not names.has("idle"): ok = false
    if n != 8: ok = false
    if sf.get_animation_speed("idle") != 8.0: ok = false
    if not sf.get_animation_loop("idle"): ok = false
    for i in n:
        var t = sf.get_frame_texture("idle", i)
        var sz = t.get_size()
        print("  frame ", i, " ", t.get_class(), " size=", sz)
        if not (t is AtlasTexture): ok = false
        if sz != Vector2(69,128): ok = false
    print("RESULT: ", "PASS" if ok else "FAIL")
    quit(0 if ok else 2)
