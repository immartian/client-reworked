Polymer({
  is: 'msc-player-view',
  ready: function() {
    mscIntf.locale = {register:this,prop:'locale'}
    // mscIntf.groups = {register:this,prop:'groups'}
    mscIntf.toolSettings.contractImagesPath = {register:this,prop:'contractImagesPath'};
  },
  properties: {
    locale: Object,
    contractImagesPath: String,
    showGroupPlayIcon: {
      type: Boolean,
      value: false,
      reflectToAttribute: true
    },
    groups: {
      type: Array,
      value: []
    },
    instructionText: {
      type: String,
      value: "",
      reflectToAttribute: true
    },
    groupActionIcon: {
      type: String,
      value: "av:play-arrow",
      reflectToAttribute: true
    },
    selectedItem: {
      type: Object,
      value: {}
    },
    actions: {
      type: Array,
      value: []
    }
  },
  _isSelected: function(item) {
    return this.selectedItem == item.id;
  },
  _shouldHideInstructions: function() {
    for (var g in this.groups) {
      if (this.groups[g] && this.groups[g].items && this.groups[g].items.length > 0)
        return true;
    }
    return false;
  },
  handleItemSelection : function(e) {
    this.notifySelectionChanged([e.model.item]);
  },
  handleGroupSelection: function(e) {
    this.notifySelectionChanged(e.model.group.items.slice());
  },
  notifySelectionChanged: function(viewItems) {
    // each view item should have a 'data' element that will be used for the callback
    this.fire('selected', viewItems.map(function(viewItem){
      return viewItem.data;
    }));
  },
  handleLine2Selection: function(e) {
    this.fire('line2-selected', e.model.item.data);
  },
  fireAction: function(e) {
    e.cancelBubble = true;
    e.stopPropagation();
    this.fire(e.model.action, e.model.dataHost.dataHost.dataHost.modelForElement(e.target).item.data);
  }
})