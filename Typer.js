

/**
* Implement artificial field typer for all text fields in the page
* @param {Object} alphabet The alphabet to use for typing
*/
Typer = function(element){
  var keys = {
        ENTER: 13,
        ESC: 27,
        UP: 38,
        DOWN: 40, 
        LEFT: 37,
        RIGHT: 39
      },
      api = {},
      open = false,
      config = {},
      $ui = null,
      capitalize = false,
      alphabet = {},
      textValue = "",
      textValueEntities = [],
      fragCache = {},
      rows = ["buttons", "value", "alpha", "secondary", "nums", "symbols"],
      rowIndexs = {}
      selected = { row: -1, index: {} },
      selectedField = false,
      buttonSelected = false,
      lastCharacter = { row: -1, index: -1 },
      secondaryCountdown = true,
      secondaryShowing = false,
      callbacks = { };

  // Default config
  config = {

    /**
    * The maximum number of characters the user can type
    * @config maxLength
    * @type int
    */
    maxLength: 0,


    /**
    * The character casing scheme: 
    *   - LOWER: All characters are lower case
    *   - UPPER: All characters are upper case
    *   - WORD_UPPER: All words start with upper
    *   - SENTENCE_UPPER: The first word in all sentences are upper case
    * @config casing
    * @type String
    */
    casing: "SENTENCE_UPPER",

    /**
    * The alphabet and symbols to use for typing. This object should have 3 character sets: alpha, symbols and nums
    * @config alphabet
    * @type Object
    */
    keyboard: {
      alpha: [['a','à','á','â','ã','ä','å'], 
              'b', 
              ['c', 'ç'], 
              'd', 
              ['e','è','é','ê','ë'], 
              'f', 'g', 'h', 
              ['i','í','î','ï'], 
              'j', 'k', 'l', 'm', 
              ['n','ñ'],
              ['o','ò','ó','ô','õ','ö'], 
              'p', 'q', 'r', 
              's', 't', 
              ['u','ù','ú','û','ü'], 
              'v', 'w', 'z', 
              ['y','ý','ÿ'], 
              'z'],
      symbols: ['.', ',', '-', '(', ')', '$', '#', '@', '!', '?', '&', ':', '/', ':', ';', '"', "'", '*', '^', '%', '<', '>', '{', '}', '[', ']', '|', '\\', '`', '~', '_', '+', '='],
      nums: [0,1,2,3,4,5,6,7,8,9]
    },

    /**
    * Weather to show the secondary alpha characters or not or after a delay
    * This value can either be true or false or a number indicating to show 
    * the secondary characters x seconds after an alpha character is selected
    * @config showSecondary
    * @type boolean or int
    */
    showSecondaryChars: 1.5
  }
  keyboard = config.keyboard;
  secondaryCountdown = (typeof config.showSecondaryChars == "number");

  /**
  * Build the typer interface and open it
  * @param {String} value The initial text value
  */
  function openTyper(value){
    var $skeleton, row;

    // Add initial value
    if( typeof value == "string" ){
      textValue = value;
    }

    // Build skeleton of the UI
    $skeleton = $("<div class='field-typer'></div>");

    $skeleton.css({
      "overflow": "hidden"
    });

    // Add row markup
    for(var i = 0, len = rows.length; i < len; i++){
      row = rows[i];

      rowIndexs[row] = i;

      switch(row){
        case "alpha":
        case "nums":
        case "symbols":
        case "secondary":
          $skeleton.append("<div class='"+ row +" row character list' data-row-index='"+ i +"'><ul></ul></div>");
        break;
        case "value":
          // This is the default row index
          if( selected.row < 0 ){
            selected.row = i;
          }
          $skeleton.append("<div class='"+ row +" row' data-row-index='"+ i +"'><em></em></div>");
        break;
        case "buttons":
          $skeleton.append("<div class='"+ row +" row' data-row-index='"+ i +"'>"
              +"<button type='button' class='btn-accept'>Ok</button>"
              +"<button type='button' class='btn-cancel'>Cancel</button>"
            +"</div>");
        break;
        default: 
          $skeleton.append("<div class='"+ row +" row' data-row-index='"+ i +"'></div>");
      }
    }

    $ui = $("<div class='field-typer-wrapper'></div>")
    $ui.append($skeleton);
    $(document.body).append($ui);

    // Position
    $ui.css({
      "position": "absolute",
      "top": $(document).scrollTop(),
      "left": 0,
      "width": $(window).width(),
      "height": $(window).height()
    })

    // Build rows
    open = true;
    shouldNextCharBeCapital();
    updateAllRows();
    selectRow(); // Update row selection
  }

  /**
  * Update the characters in all rows
  */
  function updateAllRows(){
    shouldNextCharBeCapital();

    for(var i = 0, len = rows.length; i < len; i++){
      buildRow(rows[i]);
    }
  }


  /**
  * Build the HTML for a character list row
  * @param {String} charClass The character class to build (i.e. chars, symbols, nums, secondary)
  */
  function buildRow(charClass){
    var chars = keyboard[charClass],
        chr = "",
        row = $ui.find("."+ charClass),
        ul = null,
        frag = document.createDocumentFragment();

    if( typeof chars  != "object" ){
      return false;
    }
    ul = row.find("ul:first-child");
       
    // Build list HTML
    for(var i = 0, len = chars.length; i < len; i++){
      chr = chars[i];


      // Remove this item from the keyboard
      if( typeof chr == "undefined" ){
        delete chr[i];
        i--;
        len--;
        continue;
      }

      // If multiple variations of a string exist, only use the first for the main list 
      // (others go in the secondary list)
      if( typeof chr == "object" ){
        chr = chr[0];
      }

      // Cap the character
      if( capitalize === true && charClass != "secondary" && chr.toUpperCase ){ 
        chr = chr.toUpperCase();
      }

      frag.appendChild( $("<li><span>"+ chr +"</span></li>")[0] );
    }

    // Add HTML
    fragCache[charClass] = frag.cloneNode(true);
    ul.empty();
    ul.append(frag);

    if( charClass != "secondary" ){
      fillCarousel(charClass);
    }
    else if( keyboard.secondary.length > 0 ) {
      selectCharacter("secondary", selected.index['secondary']);
    }
  }

  /**
  * Fill each character list carousel with enough characters to fill and overflow
  * @param {String} charClass The character class to build (i.e. chars, symbols, nums, secondary)
  */
  function fillCarousel(charClass){
    var row = $ui.find("."+ charClass),
        uWidth = (row[0]) ? row.width() : 0,
        carousel = (row[0]) ? row.find("ul:first-child") : null, 
        cWidth = 0, 
        charFrag = fragCache[charClass],
        fragLen = (typeof charFrag  == "undefined") ? 0 : charFrag.childNodes.length;

    // Invalid character class
    if( fragLen == 0 ){
      return false;
    }

    // Does not have width
    if( !uWidth ){
      return false;
    }

    // Take out of flow, to get absolute width
    carousel.css({
      "position": "absolute",
      "left": "-1234em",
      "width": ""
    });

    // The carousel should be twice as wide as the UI 
    // and have at least 3 copies of the character list for left and right padding.
    var n = 0;
    do{
      carousel.append(charFrag.cloneNode(true));
      cWidth = carousel.width();
    } while((cWidth < (uWidth * 2) || carousel.children().length < fragLen * 3) && ++n < 10 );

    // add with 100 for padding
    cWidth += 100;

    // Set the selection
    selected.index[charClass] = selected.index[charClass] || 0;
    selectCharacter(charClass, selected.index[charClass]);

    // Reset flow
    carousel.css({
      "position": "",
      "left": "",
      "width": cWidth +"px"
    });
  }

  /**
  * Update the secondary row with extra characters
  */
  function updateSecondaryRow(){
    var row = $ui.find(".row.secondary"),
        selRowName = rows[selected.row],
        chr = getSelectedCharacter(true),
        chars = [];

    // Don't show secondary characters
    if( config.showSecondaryChars === false ){
      return;
    }


    if( !row[0] ){
      return;
    }

    selected.index["secondary"] = 0;

    // Secondary characters
    if( selRowName == "alpha" ){

      // Hide secondary if we're only showing after a delay
      if( secondaryCountdown && secondaryShowing === true ){
        secondaryShowing = false;
        row.slideUp("fast");
        return;
      }

      // Get alternate versions of the character
      if( typeof chr == "object" ){
        for(var i = 1, len = chr.length; i < len; i++){
          chars.push(chr[i]);
          if( chr[i].toUpperCase ){
            chars.push(chr[i].toUpperCase());
          }
        }
        chr = chr[0];
      }

      // Lower case and capital
      if( capitalize ){
        chars.unshift(chr.toUpperCase());
        chars.unshift(chr.toLowerCase());
      }
      else{ 
        chars.unshift(chr.toLowerCase());
        chars.unshift(chr.toUpperCase());
      }

      keyboard.secondary = chars;
    }
    else if( selRowName != "secondary" ){
      keyboard.secondary = [];
      secondaryShowing = false;
      row.slideUp("fast");
    }

    buildRow("secondary");
    selectCharacter("secondary", 0);

    // Show
    if( keyboard.secondary.length > 0 ){

      // Show secondary after a delay
      if( secondaryCountdown ){

        clearTimeout(secondaryCountdown);
        secondaryCountdown = setTimeout(function(){
          row.slideDown("fast");
          secondaryShowing = true;
        }, config.showSecondaryChars * 1000);

      }
      // Immediately 
      else{
        row.slideDown("fast");
        secondaryShowing = true;
      }
    }
  }


  /**
  * Update the text value display
  */ 
  function updateTextValueDisplay(){
    var selectedChar = getSelectedCharacter(),
        encodedValue = "";

    // Encode everything to entitles
    for(var i = 0, len = textValue.length; i < len; i++){
      encodedValue += getCharCodeEntity(textValue[i]);
    }
    selectedChar = "<em>"+ getCharCodeEntity(selectedChar) +"</em>";

    // Update displayed value
    $ui.find(".row.value").html(encodedValue + selectedChar);
    shouldNextCharBeCapital();
  }

  /**
  * Figure out if the next character should be capitalized
  */
  function shouldNextCharBeCapital(){
    capitalize = false;
    
    switch(config.casing){
      case "UPPER":
        capitalize = true;
      break;
      case "SENTENCE_UPPER":
        capitalize = (textValue.match(/[.!\?]\s?$/) != null || textValue.length == 0);
      break;
      case "WORD_UPPER":
        capitalize = (textValue.match(/([.!\?\s])$/) != null);
      break;
      default:
        capitalize = false;
    }

    return capitalize;
  }

  /**
  * Return the character code HTML entity for a character. This will convert things like spaces to non-breaking spaces
  * @param {String} chr The character to get the code for
  */
  function getCharCodeEntity(chr){
    var code = (chr +"").charCodeAt(0);
    if( code == 38 || code == 32 ){
      code = 160;
    }
    return "&#"+ code +";";
  }

  /**
  * Get the currently selected character
  * @param {boolean} all Return entire character array, containing secondary characters
  */
  function getSelectedCharacter(all){
    var rowName = rows[selected.row],
        index = selected.index[rowName],
        charSet = keyboard[rowName], 
        chr = (charSet) ? charSet[index] : undefined;
    
    if( typeof chr != "undefined" ){
      if( all ){
        return chr;
      }

      if( typeof chr == "object" ){
        chr = chr[0];
      } 
      
      if( capitalize && chr.toUpperCase && rowName != "secondary" ){
        chr = chr.toUpperCase();
      }

      return chr;
    }

    return "&nbsp;";
  }

  /**
  * Choose the currently selected character and add it to the text field
  */
  function chooseAction(){
    var rowName = rows[selected.row],
        chr, btn;

    // Button actions
    if( rowName == "buttons" ){
      btn = $(buttonSelected);

      // Accept text and close
      if( btn.hasClass("btn-accept") ){
        if( selectedField ){
          selectedField.value = textValue;
        }
        fireCallbacks("done", textValue);
        closeTyper();
        fireCallbacks("closed", {'canceled': false});
      } 
      // Cancel typer 
      else if( btn.hasClass("btn-cancel") ){
        closeTyper();
        fireCallbacks("canceled");
        fireCallbacks("closed", {'canceled': true});
      }
    }
    // Select character
    else if( rowName != "value" ) {
      chr = getSelectedCharacter();
      appendToValue(chr);

      lastCharacter = {row: selected.row, index: selected.index[rowName] };
      updateAllRows();
    }
  }

  /**
  * Append a string or character to the value
  * @param {String} str The character(s) to add to the text value
  */
  function appendToValue(str){
    if( typeof str != "undefined" && typeof str != "object" ){
      textValue += str;

      // Add space after word boundary
      if( textValue.match(/[.!\?]$/) ){
        textValue += " ";
      }

      // Restrict to maxLength
      if( config.maxLength > 0 && textValue.length >= config.maxLength ){
        textValue = textValue.substring(0, config.maxLength);
        selectRow(rowIndexs["value"]);
      }

      updateTextValueDisplay();
      lastCharacter = false;
      fireCallbacks("textChanged", textValue);
    }
  }

  /**
  * Highlight a character index in a carousel
  * @param {String} charClass The character class to select from
  * @param {int} index The index to select
  */
  function selectCharacter(charClass, index){
    var charFrag = fragCache[charClass],
        width = 0,
        moveIndex = index,
        row = $ui.find(".row."+ charClass),
        carousel = (row[0]) ? row.find("ul:first-child") : null,
        chars = (carousel[0]) ? carousel.children() : [];

    if( !charFrag ){
      return;
    }

    // Update the index, with a whole character set padding on the left 
    moveIndex = charFrag.childNodes.length + index;

    // The index is out of bounds
    if( moveIndex >= chars.index){
      return;
    }

    // Get size to move the carousel (with two characters of left padding peaking in)
    for( var i = 0; i < moveIndex - 2; i++){
      width -= $(chars[i]).outerWidth();
    }

    // Secondary row isn't a carousel
    if( charClass == "secondary" ){
      width = 0;
      moveIndex = index;
    }

    // Update carousel position and selection
    carousel.css("margin-left", width +"px");
    carousel.find("li.selected").removeClass("selected");
    carousel.find("li:nth-child("+ (moveIndex + 1) +")").addClass("selected");
    selected.index[charClass] = index;

    // Update value if this row is selected
    if( rows[selected.row] == charClass ){
      updateTextValueDisplay();

      if( charClass != "secondary" ){
        updateSecondaryRow();
      }
    }
  }

  /** 
  * Move the cursor left and right
  * @param {int} dir The direction to move (1 = right, -1 = left)
  */
  function moveHorizontal(dir){
    var charSet, rowName, buttons,
        rowName = rows[selected.row],
        row = (typeof selected.row != "undefined") ? $ui.find(".row:nth-child("+ (selected.row + 1) +")") : null,
        selIndex = (selected.index[rowName]) ? selected.index[rowName] : 0;

    selIndex += dir;

    if( !row || !row[0] ){
      return;
    }

    // If it's a list, we are selecting characters within the set
    if( row.hasClass("character") ){
      charSet = keyboard[rowName];

      if( !charSet ){
        return;
      }
      // Keep it within the bounds
      if( selIndex >= charSet.length ){
        selIndex = 0;
      }
      else if( selIndex < 0 ){
        selIndex = charSet.length - 1;
      }

      selectCharacter(rowName, selIndex);
    }
    // Move in the text value
    else if( rowName == "value" ){

      // Delete a character
      if( dir < 0 && textValue.length > 0 ){
        textValue = textValue.substring(0, textValue.length - 1);
      }
      // Add a space
      else if( dir > 0 ){
        appendToValue(" ");
      }

      // Update text value if this row is selected
      if( rows[selected.row] == rowName ){ 
        updateTextValueDisplay();
        updateAllRows();
      }
    }
    // Select buttons
    else if( rowName == "buttons" ){
      buttons = row.find("button");

      // Bounds
      if( selIndex < 0 ){
        selIndex = buttons.length - 1;
      }
      else if( selIndex >= buttons.length ){
        selIndex = 0;
      }

      buttons[selIndex].focus();
      buttonSelected = buttons[selIndex];
      selected.index["buttons"] = selIndex;
    }

  }

  /** 
  * Move the cursor (and probably the selection) up and down
  * @param {int} dir The direction to move (1 = down, -1 = up)
  */
  function moveVertical(dir){
    var row, $row,
        rowsElems = $ui.find(".row"),
        selIndex = selected.row,
        fromRow = rows[selected.row];

    // Get the next non-empty row in this direction
    while( true ){
      selIndex += dir;
      row = rowsElems[selIndex];
      $row = $(row);

      // Not a valid row, end of the line
      if( !row ){
        return;
      }
      // Hidden rows
      if( $row.css("display") == "none" ){
        continue;
      }
      // Skip over secondary unless we're moving from alpha
      else if( $row.hasClass("secondary") && fromRow != "alpha" ){
        continue;
      }
      // List with children
      if( $row.is(".list") && $row.find("li").length > 0 ){
        break;
      }
      // All other rows
      else if( row ){
        break;
      }
    }

    // Couldn't find another non-empty row in this direction
    if( row.childNodes.length == 0 ){
      return;
    }

    // Update selected row
    selected.row = selIndex;
    selectRow(selIndex);
  }

  /**
  * Update the row selection
  * @param {int} rowIndex (optional) The row index to select. If not set, the row set in selected.row will be selected
  */
  function selectRow(rowIndex){
    rowIndex = (rowIndex)? rowIndex : selected.row;
    var row = $ui.find(".row:nth-child("+ (rowIndex + 1) +")");

    if( row ){
      $ui.find(".row.selected").removeClass("selected");
      row.addClass("selected");
      selected.row = rowIndex;

      // Select buttons
      if( row.hasClass("buttons") ){
        buttonSelected = row.find("button.btn-accept")[0]
        buttonSelected.focus();
        selected.index["buttons"] = 0;
      }
      else if( buttonSelected ){ // Deselect button
        buttonSelected.blur();
      }

      updateTextValueDisplay();
      updateSecondaryRow();
    }
  }


  /**
  * Close and destroy the typer
  */
  function closeTyper(){
    $ui.remove();
    open = false;
    if( selectedField ){
      selectedField.focus();
    }
  }

  /**
  * Add a callback to the callback stack
  * @param {String} type The callback type
  * @param {Function} func The callback function
  * @param {Object} scope (optional) The scope to the call the callback function in
  */
  function registerCallback(type, func, scope){
    scope = scope || api;
    callbacks[type] = callbacks[type] || [];
    callbacks[type].push({'func': func, 'scope': scope});
  }

  /**
  * Fire all callbacks for this event type
  * @param {String} type The event type
  * @param {Array} params The function parameters to send to the callback function
  */
  function fireCallbacks(type, params){
    var callback,
        callbacksFuncs = callbacks[type];

    // Callbacks don't exist for this type
    if( typeof callbacksFuncs != "object" || callbacksFuncs.length == 0 ){
      return;
    }

    // Fire callbacks
    for(var i = 0, len = callbacksFuncs.length; i < len; i++){
      callback = callbacksFuncs[i];
      callback.func.call(callback.scope, params);
    }
  }


  $(document).keydown(function(evt){
    
    if( open == false ){
      return;
    }

    switch(evt.keyCode){
      case keys.LEFT:
        moveHorizontal(-1);
      break;
      case keys.RIGHT:
        moveHorizontal(1);
      break;
      case keys.DOWN:
        moveVertical(1);
      break;
      case keys.UP:
        moveVertical(-1);
      break;
      case keys.ENTER:
        chooseAction();
      break;
      case keys.ESC:
        closeTyper();
      break;
      default:
        return;
    }

    evt.preventDefault();
  });

  /*
  * API
  */
  api = {

    /**
    * Attach the field typer to a form or field
    * @param {Node} elem Either a form or field element
    */
    attach: function(elem){
      var $elem = $(elem), // normalizes, if a jQuery object was passed in
          elem = $elem[0]; 

      // Attach to all form elements
      if( $elem.is("form") ){
        for( var i = 0, len = $elem[0].elements.length; i < len; i++ ){
          this.attach(elem.elements[i]);
        }
      }
      // Attach to fields
      else if( $elem.is("input[type=text]") || $elem.is("textarea") ){

        $elem.keypress(function(evt){
          var field = this;
          if( evt.keyCode == keys.ENTER ){
            selectedField = field;
            openTyper(field.value);
            field.blur();
            $ui.focus();
          }
        });

      }

      return api;
    },

    /**
    * Open the field typer
    * @param {Object} options Options you want to set on the typer
    */
    open: function(options){
      config = $.extend(config, options);
      openTyper();
      return api;
    },

    /**
    * Get the current text value
    * @returns String
    */
    getValue: function(){
      return textValue;
    },

    /**
    * Update the keyboard
    * @param {Object} userKeyboard An object representing the keyboard, with alpha, nums, symbols and (optional) secondary properties.
    */
    updateKeyboard: function(userKeyboard){
      keyboard = userKeyboard;
      return api;
    },

    /**
    * Get the text value when the user finishes entering it and presses the accept button ('Ok')
    * @param {Function} func The callback function
    * @param {Object} scope (optional) The scope to the call the callback function in
    */
    done: function(func, scope){
      registerCallback("done", func, scope);
      return api;
    },

    /**
    * Executes your callback function when the typer is canceled
    * @param {Function} func The callback function
    * @param {Object} scope (optional) The scope to the call the callback function in
    */
    canceled: function(func, scope){
      registerCallback("canceled", func, scope);
      return api;
    },

    /**
    * Executes your callback function when the user enters text
    * @param {Function} func The callback function
    * @param {Object} scope (optional) The scope to the call the callback function in
    */
    textChanged: function(func, scope){
      registerCallback("textChanged", func, scope);
      return api;
    },

    /**
    * Executes your callback function when the user closes the typer for any reason
    * @param {Function} func The callback function
    * @param {Object} scope (optional) The scope to the call the callback function in
    */
    closed: function(func, scope){
      registerCallback("close", func, scope);
      return api;
    }

  }
  return api;
}